import {
  ACESFilmicToneMapping, AmbientLight, Box3, Color, DirectionalLight, Group, HemisphereLight,
  Mesh, PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, ShadowMaterial, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AvatarRenderer, RenderFrame, RendererCapabilities } from '../core/renderer';
import type { MouthState } from '../core/types';
import { MorphRig, type MorphRigOptions } from './MorphRig';
import { disposeObject } from './dispose';

export interface ThreeRendererOptions {
  /** URL or bytes of a self-contained, uncompressed GLB with named morph targets. */
  model: string | ArrayBuffer;
  morphs?: MorphRigOptions;
  background?: string | null;
  orbit?: boolean;
  pixelRatio?: number;
  onError?: (error: Error) => void;
}

/** Rendering only: owns the GLB, scene, controls and GPU resources. */
export class ThreeRenderer implements AvatarRenderer {
  readonly ready: Promise<void>;
  private readonly scene = new Scene();
  private readonly pivot = new Group();
  private readonly camera = new PerspectiveCamera(34, 1, 0.1, 100);
  private readonly renderer: WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly loading = new AbortController();
  private rig?: MorphRig;
  private observer?: ResizeObserver;
  private destroyed = false;
  private readonly contextLost = (event: Event) => {
    event.preventDefault();
    this.options.onError?.(new Error('3D graphics context lost. Reload the page to restore the stage.'));
  };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly options: ThreeRendererOptions) {
    if (options.pixelRatio !== undefined && (!Number.isFinite(options.pixelRatio) || options.pixelRatio <= 0)) throw new Error('pixelRatio must be positive and finite');
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: options.background === null });
    this.renderer.setPixelRatio(Math.min(options.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    this.scene.background = options.background === null ? null : new Color(options.background ?? '#e9eee5');
    this.scene.add(this.pivot, new HemisphereLight(0xfaf2df, 0x647564, 2.5), new AmbientLight(0xffffff, 0.3));
    const key = new DirectionalLight(0xfff1df, 4);
    key.position.set(3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.normalBias = 0.03;
    const rim = new DirectionalLight(0xb8e4d4, 3);
    rim.position.set(-3, 3, -3);
    this.scene.add(key, rim);
    const floor = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ opacity: 0.16 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.015;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 10;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.enabled = options.orbit ?? true;
    this.resetView();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas);
    }
    canvas.addEventListener('webglcontextlost', this.contextLost);
    this.ready = this.load(options).catch((error) => { this.destroy(); throw error; });
  }

  private async load(options: ThreeRendererOptions): Promise<void> {
    let bytes: ArrayBuffer;
    if (typeof options.model === 'string') {
      const response = await fetch(options.model, { signal: this.loading.signal });
      if (!response.ok) throw new Error(`Unable to load 3D model: ${response.status}`);
      bytes = await response.arrayBuffer();
    } else bytes = options.model;
    this.loading.signal.throwIfAborted();
    // Keep imports self-contained: a character file cannot fetch external resources.
    if (bytes.byteLength < 20 || new DataView(bytes).getUint32(0, true) !== 0x46546c67) throw new Error('Choose a binary glTF (.glb) model');
    const header = new DataView(bytes);
    const jsonLength = header.getUint32(12, true);
    if (header.getUint32(4, true) !== 2 || header.getUint32(16, true) !== 0x4e4f534a || jsonLength > bytes.byteLength - 20) throw new Error('Invalid GLB header');
    const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)));
    for (const item of [...(metadata.buffers ?? []), ...(metadata.images ?? [])]) {
      if (item.uri) throw new Error('Use a self-contained GLB with embedded buffers and images');
    }
    const gltf = await new GLTFLoader().parseAsync(bytes, '');
    if (this.destroyed) { disposeObject(gltf.scene); this.loading.signal.throwIfAborted(); }
    const bounds = new Box3().setFromObject(gltf.scene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    if (!Number.isFinite(size.length()) || size.y <= 0) { disposeObject(gltf.scene); throw new Error('The GLB contains no visible model'); }
    const scale = 3.5 / Math.max(size.x, size.y, size.z);
    gltf.scene.scale.multiplyScalar(scale);
    gltf.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    gltf.scene.traverse((node) => { if (node instanceof Mesh) { node.castShadow = true; node.receiveShadow = true; } });
    this.rig = new MorphRig(gltf.scene, options.morphs);
    this.pivot.add(gltf.scene);
    this.renderer.render(this.scene, this.camera);
  }

  get capabilities(): RendererCapabilities { return { ...(this.rig?.capabilities ?? { mouth: [] as MouthState[], blink: false }), viewControl: true }; }
  reset(): void { this.rig?.reset(); }
  setViewControlEnabled(enabled: boolean): void { this.assertActive(); this.controls.enabled = enabled; }
  resetView(): void {
    this.assertActive();
    this.camera.position.set(4.1, 3.1, 7.4);
    this.controls.target.set(0, 1.8, 0);
    this.controls.update();
  }
  resize(): void {
    if (this.destroyed) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  render(frame: Readonly<RenderFrame>): void {
    if (this.destroyed) return;
    this.rig?.update(frame.motion, frame.eyesClosed, frame.deltaSeconds);
    this.pivot.position.y = Math.sin(frame.timestamp * 0.0018) * 0.024 + frame.motion.energy * 0.035;
    this.pivot.rotation.z = frame.state === 'thinking' ? 0.08 : Math.sin(frame.timestamp * 0.001) * 0.018;
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.loading.abort();
    this.observer?.disconnect(); this.controls.dispose();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    disposeObject(this.scene); this.renderer.dispose(); this.renderer.forceContextLoss();
  }
  private assertActive(): void { if (this.destroyed) throw new Error('ThreeRenderer has been destroyed'); }
}
