import { describe, expect, expectTypeOf, it } from 'vitest';
import { CharacterState, CHARACTER_STATES, isCharacterState } from '../src';
import type { CharacterState as FrameCharacterState } from '../src/core/types';
import { characterStateForVoiceSession } from '../examples/basic/characterState';

describe('public character vocabulary', () => {
  it('exports one immutable runtime definition and preserves existing string values', () => {
    expect(CHARACTER_STATES).toEqual(['idle', 'listening', 'thinking', 'speaking']);
    expect(Object.values(CharacterState)).toEqual(CHARACTER_STATES);
    expect(Object.isFrozen(CharacterState)).toBe(true);
    expect(Object.isFrozen(CHARACTER_STATES)).toBe(true);
    expect(JSON.stringify({ state: CharacterState.Thinking })).toBe('{"state":"thinking"}');
    expectTypeOf<FrameCharacterState>().toEqualTypeOf<CharacterState>();
    const fromJSON: CharacterState = 'speaking';
    expect(fromJSON).toBe(CharacterState.Speaking);
  });

  it('accepts only character states, excluding transport and playback lifecycle values', () => {
    for (const state of CHARACTER_STATES) expect(isCharacterState(state)).toBe(true);
    for (const value of ['Idle', 'connecting', 'disconnected', 'playing', 'error', 'stopping', '', 0, null, undefined, {}, ['idle']]) {
      expect(isCharacterState(value)).toBe(false);
    }
  });

  it('maps session lifecycle to the shared character vocabulary at the demo boundary', () => {
    for (const state of ['disconnected', 'connecting', 'stopping', 'error'] as const) {
      expect(characterStateForVoiceSession(state)).toBe(CharacterState.Idle);
    }
    expect(characterStateForVoiceSession('listening')).toBe(CharacterState.Listening);
    expect(characterStateForVoiceSession('thinking')).toBe(CharacterState.Thinking);
    expect(characterStateForVoiceSession('speaking')).toBe(CharacterState.Speaking);
  });
});
