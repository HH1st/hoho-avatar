import { describe, expect, expectTypeOf, it } from 'vitest';
import { MouthState, MOUTH_STATES, isMouthState } from '../src';
import type { MouthState as ModelMouthState } from '../src/core/types';

describe('public mouth vocabulary', () => {
  it('exports immutable runtime values without changing serialized character keys', () => {
    expect(MOUTH_STATES).toEqual(['closed', 'small', 'large', 'wide', 'round']);
    expect(Object.values(MouthState)).toEqual(MOUTH_STATES);
    expect(Object.isFrozen(MouthState)).toBe(true);
    expect(Object.isFrozen(MOUTH_STATES)).toBe(true);
    expect(JSON.stringify({ mouth: MouthState.Round })).toBe('{"mouth":"round"}');
    expectTypeOf<ModelMouthState>().toEqualTypeOf<MouthState>();
    const fromJSON: MouthState = 'round';
    expect(fromJSON).toBe(MouthState.Round);
  });
  it('validates external values against the same vocabulary', () => {
    for (const state of MOUTH_STATES) expect(isMouthState(state)).toBe(true);
    for (const value of ['open', 'Closed', 'mouth_round', '', 0, null, undefined, {}, ['round']]) {
      expect(isMouthState(value)).toBe(false);
    }
  });
});
