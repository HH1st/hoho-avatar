import type { CharacterDefinition, MouthState, SpritePlacement } from "./types";

const mouthStates: readonly MouthState[] = ["closed", "small", "large", "wide", "round"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function requirePoint(value: unknown, label: string): asserts value is { x: number; y: number } {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error(`${label} must contain finite numeric x and y values.`);
  }
}

function requirePlacement(value: unknown, label: string): asserts value is SpritePlacement {
  if (!isRecord(value) || !isNonEmptyString(value.src)) throw new Error(`${label}.src must be a non-empty string.`);
  for (const key of ["x", "y", "width", "height"] as const) {
    const coordinate = value[key];
    if (coordinate !== undefined && !isFiniteNumber(coordinate)) throw new Error(`${label}.${key} must be a finite number.`);
  }
  if (isFiniteNumber(value.width) && value.width <= 0) throw new Error(`${label}.width must be positive.`);
  if (isFiniteNumber(value.height) && value.height <= 0) throw new Error(`${label}.height must be positive.`);
}

/** Validate untrusted JSON before it reaches the renderer or asset loader. */
export function parseCharacterDefinition(value: unknown): CharacterDefinition {
  if (!isRecord(value) || value.version !== 1) throw new Error("character.json must use version 1.");
  if (!isRecord(value.canvas) || !isFiniteNumber(value.canvas.width) || !isFiniteNumber(value.canvas.height)
    || value.canvas.width <= 0 || value.canvas.height <= 0) {
    throw new Error("character.json must define a positive, finite canvas width and height.");
  }
  requirePlacement(value.body, "body");
  if (!isRecord(value.mouth)) throw new Error("character.json is missing mouth settings.");
  requirePoint(value.mouth.anchor, "mouth.anchor");
  if (!isRecord(value.mouth.sprites)) throw new Error("character.json is missing mouth sprites.");
  for (const state of mouthStates) {
    if (!isNonEmptyString(value.mouth.sprites[state])) throw new Error(`character.json is missing mouth sprite: ${state}.`);
  }
  if (value.eyes !== undefined) {
    if (!isRecord(value.eyes)) throw new Error("eyes must be an object.");
    requirePoint(value.eyes.anchor, "eyes.anchor");
    if (!isRecord(value.eyes.sprites) || !isNonEmptyString(value.eyes.sprites.open) || !isNonEmptyString(value.eyes.sprites.closed)) {
      throw new Error("eyes.sprites must contain open and closed images.");
    }
  }
  if (value.animation !== undefined) {
    if (!isRecord(value.animation)) throw new Error("animation must be an object.");
    const bounce = value.animation.bodyBouncePx;
    if (bounce !== undefined && (!isFiniteNumber(bounce) || bounce < 0)) {
      throw new Error("animation.bodyBouncePx must be a non-negative finite number.");
    }
  }
  return value as unknown as CharacterDefinition;
}

