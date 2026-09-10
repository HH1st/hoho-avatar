/** Renderer-independent interaction state, separate from audio/connection lifecycle. */
export const CharacterState = Object.freeze({
  Idle: 'idle',
  Listening: 'listening',
  Thinking: 'thinking',
  Speaking: 'speaking',
} as const);

export type CharacterState = typeof CharacterState[keyof typeof CharacterState];

export const CHARACTER_STATES: readonly CharacterState[] = Object.freeze(Object.values(CharacterState));

export function isCharacterState(value: unknown): value is CharacterState {
  return typeof value === 'string' && CHARACTER_STATES.some((state) => state === value);
}
