import { describe, expect, it } from "vitest";
import { parseCharacterDefinition } from "../src/core/CharacterDefinition";

const validCharacter = () => ({
  version: 1,
  canvas: { width: 128, height: 128 },
  body: { src: "body.png" },
  mouth: {
    anchor: { x: 64, y: 80 },
    sprites: {
      closed: "closed.png",
      small: "small.png",
      large: "large.png",
      wide: "wide.png",
      round: "round.png",
    },
  },
});

describe("parseCharacterDefinition", () => {
  it("accepts a complete character definition", () => {
    expect(parseCharacterDefinition(validCharacter())).toEqual(validCharacter());
  });

  it("rejects missing mouth sprites at the engine boundary", () => {
    const character = validCharacter();
    delete (character.mouth.sprites as Partial<typeof character.mouth.sprites>).round;
    expect(() => parseCharacterDefinition(character)).toThrow(/round/);
  });

  it("rejects invalid dimensions and animation values", () => {
    expect(() => parseCharacterDefinition({ ...validCharacter(), canvas: { width: Infinity, height: 128 } })).toThrow(/canvas/);
    expect(() => parseCharacterDefinition({ ...validCharacter(), animation: { bodyBouncePx: -1 } })).toThrow(/bodyBouncePx/);
  });
});

