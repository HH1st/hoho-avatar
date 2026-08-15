import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { loadCharacterPackage } from "../examples/basic/characterPackage";

const definition = {
  version: 1,
  canvas: { width: 512, height: 512 },
  body: { src: "body.png" },
  mouth: {
    anchor: { x: 256, y: 320 },
    sprites: {
      closed: "mouth-closed.png",
      small: "mouth-small.png",
      large: "mouth-large.png",
      wide: "mouth-wide.png",
      round: "mouth-round.png",
    },
  },
};

function packageFile(overrides: Record<string, Uint8Array> = {}) {
  const image = new Uint8Array([137, 80, 78, 71]);
  const files: Record<string, Uint8Array> = {
    "avatar/character.json": strToU8(JSON.stringify(definition)),
    "avatar/body.png": image,
    "avatar/mouth-closed.png": image,
    "avatar/mouth-small.png": image,
    "avatar/mouth-large.png": image,
    "avatar/mouth-wide.png": image,
    "avatar/mouth-round.png": image,
    ...overrides,
  };
  const bytes = zipSync(files);
  return { name: "avatar.zip", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
}

describe("loadCharacterPackage", () => {
  it("resolves referenced images to disposable object URLs", async () => {
    const revoked: string[] = [];
    let nextUrl = 0;
    const loaded = await loadCharacterPackage(packageFile(), {
      create: () => `blob:test-${++nextUrl}`,
      revoke: (url) => revoked.push(url),
    });

    expect(loaded.name).toBe("avatar");
    expect(loaded.definition.body.src).toBe("blob:test-1");
    expect(loaded.definition.mouth.sprites.round).toBe("blob:test-6");
    loaded.dispose();
    expect(revoked).toHaveLength(6);
  });

  it("rejects a package with a missing referenced asset", async () => {
    const files = packageFile();
    const bytes = await unzipAndRemove(files, "avatar/mouth-wide.png");
    await expect(loadCharacterPackage(bytes, { create: () => "blob:test", revoke: () => undefined })).rejects.toThrow("Missing referenced asset: mouth-wide.png");
  });

  it("rejects packages without character.json", async () => {
    const bytes = zipSync({ "avatar/body.png": new Uint8Array([1]) });
    await expect(loadCharacterPackage({ name: "avatar.zip", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer })).rejects.toThrow("does not contain character.json");
  });
});

function unzipAndRemove(file: ReturnType<typeof packageFile>, path: string) {
  return file.arrayBuffer().then((buffer) => {
    const files = unzipSync(new Uint8Array(buffer));
    delete files[path];
    const bytes = zipSync(files);
    return { name: "avatar.zip", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
  });
}
