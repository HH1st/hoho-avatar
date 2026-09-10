import { CharacterState } from '../core/CharacterState';
import { MouthState, MOUTH_STATES } from '../core/MouthState';
import type { RenderFrame, RendererCapabilities } from '../core/renderer';

/** Values are in the model's own parameter units. */
export interface Live2DMouthPose { open: number; form: number; }
export interface Live2DParameterOptions {
  mouthOpen?: string;
  mouthForm?: string;
  eyeLeft?: string;
  eyeRight?: string;
  headTilt?: string;
  mouth?: Partial<Record<MouthState, Live2DMouthPose>>;
}

/** Small structural contract so parameter mapping can be used without a renderer. */
export interface Live2DParameterModel {
  getParameterIndex(id: string): number;
  getParameterCount(): number;
  getParameterMinimumValue(index: number): number;
  getParameterMaximumValue(index: number): number;
  getParameterDefaultValue(index: number): number;
  setParameterValueByIndex(index: number, value: number): void;
}

const poses: Readonly<Record<MouthState, Live2DMouthPose>> = {
  [MouthState.Closed]: { open: 0, form: 0 },
  [MouthState.Small]: { open: 0.25, form: 0 },
  [MouthState.Large]: { open: 1, form: 0 },
  [MouthState.Wide]: { open: 0.45, form: 1 },
  [MouthState.Round]: { open: 0.6, form: -1 },
};

/** Shared states become model parameters; not a second mouth/state enum. */
export class Live2DParameters {
  readonly capabilities: RendererCapabilities;
  private readonly mouthOpen: number;
  private readonly mouthForm: number;
  private readonly eyes: number[];
  private readonly tilt: number;
  private readonly mouth: Record<MouthState, Live2DMouthPose>;
  private open = 0;
  private form = 0;
  private angle = 0;

  constructor(private readonly model: Live2DParameterModel, options: Live2DParameterOptions = {}) {
    const find = (explicit: string | undefined, ...defaults: string[]) => {
      for (const id of explicit === undefined ? defaults : [explicit]) {
        const index = model.getParameterIndex(id);
        // The runtime port returns -1 for absent parameters; accept only real indices.
        if (index >= 0 && index < model.getParameterCount()) return index;
      }
      return -1;
    };
    this.mouthOpen = find(options.mouthOpen, 'ParamMouthOpenY', 'PARAM_MOUTH_OPEN_Y');
    this.mouthForm = find(options.mouthForm, 'ParamMouthForm', 'PARAM_MOUTH_FORM');
    this.eyes = [...new Set([
      find(options.eyeLeft, 'ParamEyeLOpen', 'PARAM_EYE_L_OPEN'),
      find(options.eyeRight, 'ParamEyeROpen', 'PARAM_EYE_R_OPEN'),
    ].filter((index) => index >= 0))];
    this.tilt = find(options.headTilt, 'ParamAngleZ', 'PARAM_ANGLE_Z');
    this.mouth = { ...poses, ...options.mouth };
    for (const pose of Object.values(this.mouth)) {
      if (!Number.isFinite(pose.open) || !Number.isFinite(pose.form)) throw new Error('Mouth parameter values must be finite');
    }
    this.capabilities = {
      mouth: this.mouthOpen >= 0 ? MOUTH_STATES : [MouthState.Closed],
      blink: this.eyes.length > 0,
      viewControl: true,
    };
    this.reset();
  }

  /** Called by the runtime after simulation, immediately before drawing. */
  apply(frame: Readonly<RenderFrame>): void {
    const alpha = 1 - Math.exp(-22 * Math.max(0, Math.min(0.1, frame.deltaSeconds)));
    const pose = this.mouth[frame.motion.mouth];
    this.open += (pose.open - this.open) * alpha;
    this.form += (pose.form - this.form) * alpha;
    const restAngle = this.tilt >= 0 ? this.model.getParameterDefaultValue(this.tilt) : 0;
    const targetAngle = restAngle + (frame.state === CharacterState.Thinking ? 8 : 0);
    this.angle += (targetAngle - this.angle) * alpha;
    this.set(this.mouthOpen, this.open);
    this.set(this.mouthForm, this.form);
    for (const index of this.eyes) this.set(index, frame.eyesClosed ? 0 : this.model.getParameterDefaultValue(index));
    this.set(this.tilt, this.angle);
  }

  reset(): void {
    this.open = this.mouth[MouthState.Closed].open;
    this.form = this.mouth[MouthState.Closed].form;
    this.angle = this.tilt >= 0 ? this.model.getParameterDefaultValue(this.tilt) : 0;
    this.set(this.mouthOpen, this.open); this.set(this.mouthForm, this.form);
    this.set(this.tilt, this.angle);
    for (const index of this.eyes) this.set(index, this.model.getParameterDefaultValue(index));
  }

  private set(index: number, value: number): void {
    if (index < 0) return;
    const clamped = Math.max(this.model.getParameterMinimumValue(index), Math.min(this.model.getParameterMaximumValue(index), value));
    this.model.setParameterValueByIndex(index, clamped);
  }
}
