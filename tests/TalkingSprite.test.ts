import { afterEach, describe, expect, it, vi } from "vitest";
import { TalkingSprite } from "../src/core/TalkingSprite";
import type { CharacterDefinition } from "../src/core/types";

const character: CharacterDefinition = {
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
};

describe("TalkingSprite", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not initialize a renderer after being destroyed during loading", async () => {
    const images: Array<{ onload: (() => void) | null; width: number; height: number }> = [];
    vi.stubGlobal("Image", class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 16;
      height = 16;
      constructor() { images.push(this); }
      set src(_value: string) {}
    });
    vi.stubGlobal("document", { baseURI: "https://example.test/" });

    const context = { clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: true };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
    const sprite = new TalkingSprite(canvas, { character, sampleRate: 48_000 });

    sprite.destroy();
    for (const image of images) image.onload?.();
    await sprite.ready;

    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
    expect(() => sprite.start()).toThrow(/destroyed/);
  });
});

