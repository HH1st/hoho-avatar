import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MorphRig } from '../src/three/MorphRig';
import { MouthState, MOUTH_STATES } from '../src/core/MouthState';
import { disposeObject } from '../src/three/dispose';

async function loadMochi() {
  const file = await readFile('public/models/mochi/mochi.glb');
  return new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
}
describe('Blender / Three.js morph contract', () => {
  it('combines states mapped to the same target before applying smoothing', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    const target = new Float32BufferAttribute([0, 1, 0], 3); target.name = 'jawOpen';
    geometry.morphAttributes.position = [target];
    const mesh = new Mesh(geometry);
    const rig = new MorphRig(mesh, { mouth: { small: 'jawOpen', large: 'jawOpen', wide: 'jawOpen', round: 'jawOpen' } });
    for (const state of MOUTH_STATES.filter((state) => state !== MouthState.Closed)) {
      rig.reset();
      for (let i = 0; i < 20; i++) rig.update({ mouth: state }, false, 0.1);
      expect(mesh.morphTargetInfluences[0]).toBeGreaterThan(0.99);
    }
    for (let i = 0; i < 20; i++) rig.update({ mouth: MouthState.Closed }, false, 0.1);
    expect(mesh.morphTargetInfluences[0]).toBeLessThan(0.01);
    disposeObject(mesh);
  });
  it('loads the exported GLB and animates all four mouths plus both eyelids', async () => {
    const { scene } = await loadMochi();
    const rig = new MorphRig(scene);
    expect(rig.capabilities).toEqual({ mouth: MOUTH_STATES, blink: true });
    const mouth = scene.getObjectByName('Mouth');
    const eye = scene.getObjectByName('Eye_L');
    for (const state of MOUTH_STATES.filter((state) => state !== MouthState.Closed)) {
      for (let i = 0; i < 20; i++) rig.update({ mouth: state, energy: 1 }, true, 1 / 60);
      const index = mouth.morphTargetDictionary[`mouth_${state}`];
      expect(mouth.morphTargetInfluences[index]).toBeGreaterThan(0.99);
      expect(eye.morphTargetInfluences[eye.morphTargetDictionary.blink]).toBe(1);
      // The Blender morph has real deformed vertices, not just named empty targets.
      expect(mouth.geometry.morphAttributes.position[index].array.some((value) => value !== 0)).toBe(true);
    }
    rig.reset();
    expect(mouth.morphTargetInfluences.every((value) => value === 0)).toBe(true);
    expect(eye.morphTargetInfluences.every((value) => value === 0)).toBe(true);
    disposeObject(scene);
  });
  it('reports missing targets and supports caller-supplied morph names', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3));
    const target = new Float32BufferAttribute([0, 1, 0], 3); target.name = 'jawOpen';
    geometry.morphAttributes.position = [target];
    const mesh = new Mesh(geometry);
    const rig = new MorphRig(mesh, { mouth: { large: 'jawOpen' } });
    expect(rig.capabilities).toEqual({ mouth: ['closed', 'large'], blink: false });
    rig.update({ mouth: 'large' }, false, 0.1);
    expect(mesh.morphTargetInfluences[0]).toBeGreaterThan(0.8);
    disposeObject(mesh);
  });
  it('disposes shared GPU geometry, materials and textures exactly once', () => {
    const root = new Group(); const geometry = new BufferGeometry();
    const texture = new Texture(); const material = new MeshStandardMaterial({ map: texture });
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const spies = [geometry, texture, material].map((value) => vi.spyOn(value, 'dispose'));
    disposeObject(root);
    for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  });
});
