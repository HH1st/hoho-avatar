import { strToU8, unzipSync, zipSync, Zip, ZipDeflate } from "fflate";
import { describe, expect, it } from "vitest";
import { loadSpriteCharacterPackage } from "../examples/basic/characterPackage";

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
  return archiveFile(bytes);
}

function archiveFile(bytes: Uint8Array) {
  return { name: "avatar.zip", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer };
}

// Change only size metadata; the compressed payload remains small.
function setDeclaredSize(bytes: Uint8Array, size: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) view.setUint32(offset + 22, size, true);
    if (signature === 0x02014b50) view.setUint32(offset + 24, size, true);
  }
  return bytes;
}

function streamedArchive(files: Record<string, Uint8Array>, repeat = 1) {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, data) => {
    if (error) throw error;
    chunks.push(data);
  });
  for (const [path, data] of Object.entries(files)) {
    const entry = new ZipDeflate(path);
    zip.add(entry);
    for (let index = 0; index < repeat; index += 1) entry.push(data, index === repeat - 1);
  }
  zip.end();
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

describe("loadSpriteCharacterPackage", () => {
  it("resolves referenced images to disposable object URLs", async () => {
    const revoked: string[] = [];
    let nextUrl = 0;
    const loaded = await loadSpriteCharacterPackage(packageFile(), {
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
    await expect(loadSpriteCharacterPackage(bytes, { create: () => "blob:test", revoke: () => undefined })).rejects.toThrow("Missing referenced asset: mouth-wide.png");
  });

  it("rejects packages without character.json", async () => {
    const bytes = zipSync({ "avatar/body.png": new Uint8Array([1]) });
    await expect(loadSpriteCharacterPackage({ name: "avatar.zip", size: bytes.byteLength, arrayBuffer: async () => bytes.slice().buffer })).rejects.toThrow("does not contain character.json");
  });

  it("accepts streamed archives whose local headers omit original sizes", async () => {
    const files = unzipSync(new Uint8Array(await packageFile().arrayBuffer()));
    const loaded = await loadSpriteCharacterPackage(archiveFile(streamedArchive(files)), { create: () => "blob:test", revoke: () => undefined });
    expect(loaded.name).toBe("avatar");
    loaded.dispose();
  });

  it("accepts stored entries and ignores directory and metadata payloads", async () => {
    const files = unzipSync(new Uint8Array(await packageFile().arrayBuffer()));
    files["avatar/"] = new Uint8Array();
    files["__MACOSX/ignored"] = new Uint8Array(1);
    files["avatar/.DS_Store"] = new Uint8Array(1);
    const bytes = zipSync(files, { level: 0 });
    const loaded = await loadSpriteCharacterPackage(archiveFile(bytes), { create: () => "blob:test", revoke: () => undefined });
    expect(loaded.name).toBe("avatar");
    loaded.dispose();
  });

  it("rejects an oversized declaration before attempting to decompress its payload", async () => {
    const bytes = setDeclaredSize(zipSync({ "large.png": new Uint8Array(1) }), 75 * 1024 * 1024 + 1);
    // An unsupported compression type would fail if extraction started.
    const view = new DataView(bytes.buffer);
    view.setUint16(8, 99, true);
    for (let offset = 0; offset + 4 <= bytes.length; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) view.setUint16(offset + 10, 99, true);
    }
    await expect(loadSpriteCharacterPackage(archiveFile(bytes))).rejects.toThrow("75 MB");
  });

  it("enforces the declared size limit across multiple entries", async () => {
    const bytes = setDeclaredSize(zipSync({ "a.png": new Uint8Array(1), "b.png": new Uint8Array(1) }), 40 * 1024 * 1024);
    await expect(loadSpriteCharacterPackage(archiveFile(bytes))).rejects.toThrow("75 MB");
  });

  it("limits actual streamed output even when archive size metadata is understated", async () => {
    const bytes = setDeclaredSize(streamedArchive({ "large.png": new Uint8Array(1024 * 1024) }, 76), 1);
    expect(bytes.length).toBeLessThan(25 * 1024 * 1024);
    await expect(loadSpriteCharacterPackage(archiveFile(bytes))).rejects.toThrow("75 MB");
  });

  it("rejects duplicate normalized paths instead of silently replacing assets", async () => {
    await expect(loadSpriteCharacterPackage(packageFile({ "avatar/./body.png": new Uint8Array([1]) }))).rejects.toThrow("Duplicate");
  });

  it("rejects archives with excessive entry counts", async () => {
    const files = Object.fromEntries(Array.from({ length: 1025 }, (_, index) => [`file-${index}`, new Uint8Array()]));
    await expect(loadSpriteCharacterPackage(archiveFile(zipSync(files)))).rejects.toThrow("too many entries");
  });

  it("checks the actual compressed buffer size as well as the file metadata", async () => {
    const file = { ...archiveFile(new Uint8Array(25 * 1024 * 1024 + 1)), size: 1 };
    await expect(loadSpriteCharacterPackage(file)).rejects.toThrow("25 MB");
  });

  it("rejects a truncated archive", async () => {
    const bytes = new Uint8Array(await packageFile().arrayBuffer());
    await expect(loadSpriteCharacterPackage(archiveFile(bytes.subarray(0, bytes.length - 22)))).rejects.toThrow("ZIP could not be opened");
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
