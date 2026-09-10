import { Mesh, Object3D } from 'three';
import type { MotionFrame } from '../core/types';
import { MouthState, MOUTH_STATES } from '../core/MouthState';

type ArticulatedMouthState = Exclude<MouthState, typeof MouthState.Closed>;

export interface MorphRigOptions {
  mouth?: Partial<Record<ArticulatedMouthState, string>>;
  blink?: string;
}
type Binding = { mesh: Mesh; index: number };
type MouthBinding = Binding & { states: Set<MouthState> };
const mouths = MOUTH_STATES.filter((state): state is ArticulatedMouthState => state !== MouthState.Closed);

/** Maps a shared MotionFrame to Blender shape keys exported as glTF morph targets. */
export class MorphRig {
  private readonly mouth = new Map<MouthState, Binding[]>();
  private readonly mouthTargets: MouthBinding[] = [];
  private readonly eyes: Binding[];
  readonly capabilities: { mouth: MouthState[]; blink: boolean };

  constructor(root: Object3D, options: MorphRigOptions = {}) {
    const find = (name: string): Binding[] => {
      const result: Binding[] = [];
      root.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        const index = node.morphTargetDictionary?.[name];
        if (index !== undefined && node.morphTargetInfluences) result.push({ mesh: node, index });
      });
      return result;
    };
    for (const state of mouths) this.mouth.set(state, find(options.mouth?.[state] ?? `mouth_${state}`));
    for (const [state, bindings] of this.mouth) {
      for (const binding of bindings) {
        let target = this.mouthTargets.find((item) => item.mesh === binding.mesh && item.index === binding.index);
        if (!target) {
          target = { ...binding, states: new Set() };
          this.mouthTargets.push(target);
        }
        target.states.add(state);
      }
    }
    this.eyes = find(options.blink ?? 'blink');
    this.capabilities = { mouth: MOUTH_STATES.filter((state) => state === MouthState.Closed || this.mouth.get(state)!.length > 0), blink: this.eyes.length > 0 };
  }

  update(frame: Readonly<MotionFrame>, blink: boolean, deltaSeconds: number): void {
    const alpha = 1 - Math.exp(-22 * Math.max(0, Math.min(0.1, deltaSeconds)));
    for (const { mesh, index, states } of this.mouthTargets) {
      const target = states.has(frame.mouth) ? 1 : 0;
      const weights = mesh.morphTargetInfluences!;
      weights[index] = (weights[index] ?? 0) + (target - (weights[index] ?? 0)) * alpha;
    }
    for (const { mesh, index } of this.eyes) mesh.morphTargetInfluences![index] = blink ? 1 : 0;
  }

  reset(): void {
    for (const bindings of [...this.mouth.values(), this.eyes]) {
      for (const { mesh, index } of bindings) mesh.morphTargetInfluences![index] = 0;
    }
  }
}
