/** Renderer-independent mouth vocabulary. Values also form the asset/JSON contract. */
export const MouthState = Object.freeze({
  Closed: 'closed',
  Small: 'small',
  Large: 'large',
  Wide: 'wide',
  Round: 'round',
} as const);

export type MouthState = typeof MouthState[keyof typeof MouthState];

/** Stable display/validation order, derived from the same runtime definition. */
export const MOUTH_STATES: readonly MouthState[] = Object.freeze(Object.values(MouthState));

export function isMouthState(value: unknown): value is MouthState {
  return typeof value === 'string' && MOUTH_STATES.some((state) => state === value);
}
