import { describe, expect, it } from 'vitest';
import { Live2DParameters } from '../src/live2d/parameters';
import { CharacterState, MouthState, MOUTH_STATES } from '../src';
import type { RenderFrame } from '../src';

function model(ids = ['ParamMouthOpenY', 'ParamMouthForm', 'ParamEyeLOpen', 'ParamEyeROpen', 'ParamAngleZ']) {
  const values = ids.map(() => 0);
  return {
    values,
    getParameterIndex: (id: string) => ids.indexOf(id) < 0 ? ids.length + 1 : ids.indexOf(id),
    getParameterCount: () => ids.length,
    getParameterMinimumValue: (index: number) => /Form|FORM|Angle|ANGLE/.test(ids[index]!) ? -30 : 0,
    getParameterMaximumValue: (index: number) => /Angle|ANGLE/.test(ids[index]!) ? 30 : 1,
    getParameterDefaultValue: (index: number) => /Eye|EYE/.test(ids[index]!) ? 1 : 0,
    setParameterValueByIndex: (index: number, value: number) => { values[index] = value; },
  };
}
const frame = (mouth: MouthState, state: CharacterState = CharacterState.Idle, eyesClosed = false): RenderFrame => ({
  motion: { mouth, energy: 0.5, speaking: mouth !== MouthState.Closed, timestamp: 0 }, state, eyesClosed, timestamp: 100, deltaSeconds: 0.1,
});

describe('Live2D shared parameter contract', () => {
  it('maps all mouth states and blinking, with shared thinking state and reset', () => {
    const core = model(); const rig = new Live2DParameters(core);
    expect(rig.capabilities).toEqual({ mouth: MOUTH_STATES, blink: true, viewControl: true });
    for (const mouth of MOUTH_STATES) {
      rig.reset();
      for (let i = 0; i < 20; i++) rig.apply(frame(mouth, CharacterState.Thinking, true));
      expect(core.values[0]).toBeCloseTo({ closed: 0, small: 0.25, large: 1, wide: 0.45, round: 0.6 }[mouth]);
      expect(core.values[2]).toBe(0); expect(core.values[3]).toBe(0);
      expect(core.values[4]).toBeCloseTo(8);
    }
    rig.reset(); expect(core.values).toEqual([0, 0, 1, 1, 0]);
  });
  it('detects legacy parameter names and excludes Cubism virtual missing IDs', () => {
    const core = model(['PARAM_MOUTH_OPEN_Y', 'PARAM_EYE_L_OPEN']);
    const rig = new Live2DParameters(core);
    expect(rig.capabilities.mouth).toEqual(MOUTH_STATES); expect(rig.capabilities.blink).toBe(true);
    const empty = new Live2DParameters(model([]));
    expect(empty.capabilities).toEqual({ mouth: [MouthState.Closed], blink: false, viewControl: true });
  });
  it('accepts explicit parameter mapping and clamps values to model limits', () => {
    const core = model(['jaw', 'eyes']);
    const rig = new Live2DParameters(core, { mouthOpen: 'jaw', eyeLeft: 'eyes', eyeRight: 'eyes', mouth: { large: { open: 10, form: 0 } } });
    rig.apply(frame(MouthState.Large)); expect(core.values[0]).toBe(1);
    expect(() => new Live2DParameters(core, { mouth: { large: { open: NaN, form: 0 } } })).toThrow('finite');
  });
});
