import { readFileSync, readdirSync } from "node:fs";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { loadSpriteCharacterPackage } from "../examples/basic/characterPackage";

describe("bundled character ZIP import", () => {
  it.each(["niu-lai", "pixel-bot", "pixel-portrait"])("preserves %s image bytes", async (name) => {
    const directory = new URL(`../public/characters/${name}/`, import.meta.url);
    const files = Object.fromEntries(readdirSync(directory).map((file) => [
      `${name}/${file}`, new Uint8Array(readFileSync(new URL(file, directory))),
    ]));
    const bytes = zipSync(files);
    const blobs = [];
    const revoked = [];
    const loaded = await loadSpriteCharacterPackage({
      name: `${name}.zip`,
      size: bytes.byteLength,
      arrayBuffer: async () => bytes.slice().buffer,
    }, {
      create: (blob) => { blobs.push(blob); return `blob:test-${blobs.length}`; },
      revoke: (url) => revoked.push(url),
    });
    expect(loaded.name).toBe(name);
    const imagePaths = ["body.png", ...["closed", "small", "large", "wide", "round"].map((state) => `mouth-${state}.png`), "eyes-open.png", "eyes-closed.png"];
    expect(blobs).toHaveLength(imagePaths.length);
    for (const [index, path] of imagePaths.entries()) {
      expect(new Uint8Array(await blobs[index].arrayBuffer())).toEqual(files[`${name}/${path}`]);
    }
    loaded.dispose();
    expect(revoked).toHaveLength(imagePaths.length);
  });
});
