import { strFromU8, unzipSync, Unzip, UnzipInflate } from "fflate";
import { parseCharacterDefinition, MOUTH_STATES } from "../../src";
import type { CharacterDefinition, MouthState } from "../../src";

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 75 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1024;
// Bound each inflate call, even if the archive lies about uncompressed sizes.
const ZIP_CHUNK_BYTES = 1024;

class CharacterArchiveError extends Error {}

interface PackageFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface ObjectUrlApi {
  create(blob: Blob): string;
  revoke(url: string): void;
}

export interface LoadedCharacterPackage {
  definition: CharacterDefinition;
  name: string;
  dispose(): void;
}

const browserObjectUrls: ObjectUrlApi = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

function normalizeZipPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll("\\", "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new CharacterArchiveError(`Asset path escapes the character folder: ${path}`);
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function resolveAssetPath(configPath: string, assetPath: string): string {
  if (/^(?:[a-z]+:|\/)/i.test(assetPath)) throw new Error(`Asset paths must be relative: ${assetPath}`);
  const directory = configPath.includes("/") ? configPath.slice(0, configPath.lastIndexOf("/") + 1) : "";
  return normalizeZipPath(`${directory}${assetPath}`);
}

function mimeType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

async function extractCharacterFiles(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const entries = new Map<string, string | undefined>();
  const paths = new Set<string>();
  let declaredBytes = 0;
  let extractedBytes = 0;
  const sizeError = () => new CharacterArchiveError("Extracted character files are larger than 75 MB.");

  try {
    // Read the central directory without allocating any decompressed payloads.
    // This also rejects archives with missing or truncated directory records.
    unzipSync(bytes, { filter: (entry) => {
      if (entries.size >= MAX_ZIP_ENTRIES) throw new CharacterArchiveError("The ZIP contains too many entries (maximum 1024).");
      if (entries.has(entry.name)) throw new CharacterArchiveError(`Duplicate ZIP entry: ${entry.name}`);
      const path = normalizeZipPath(entry.name);
      const ignored = !path || /[\\/]$/.test(entry.name) || path.startsWith("__MACOSX/")
        || path.split("/").some((part) => part.startsWith("."));
      entries.set(entry.name, ignored ? undefined : path);
      if (!ignored) {
        if (paths.has(path)) throw new CharacterArchiveError(`Duplicate asset path: ${path}`);
        paths.add(path);
        declaredBytes += entry.originalSize;
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_EXTRACTED_BYTES) throw sizeError();
      }
      return false;
    } });

    const seen = new Set<string>();
    const unzip = new Unzip((entry) => {
      if (!entries.has(entry.name) || seen.has(entry.name)) throw new Error("Inconsistent ZIP directory");
      seen.add(entry.name);
      const path = entries.get(entry.name);
      if (path === undefined) return;
      if (entry.originalSize !== undefined && entry.originalSize > MAX_EXTRACTED_BYTES - extractedBytes) throw sizeError();
      const chunks: Uint8Array[] = [];
      let length = 0;
      entry.ondata = (error, chunk, final) => {
        if (error) throw error;
        extractedBytes += chunk.byteLength;
        if (extractedBytes > MAX_EXTRACTED_BYTES) throw sizeError();
        chunks.push(chunk);
        length += chunk.byteLength;
        if (final) {
          const data = new Uint8Array(length);
          let offset = 0;
          for (const part of chunks) { data.set(part, offset); offset += part.byteLength; }
          chunks.length = 0;
          files.set(path, data);
        }
      };
      entry.start();
    });
    unzip.register(UnzipInflate);
    let lastYield = performance.now();
    for (let offset = 0; offset < bytes.length; offset += ZIP_CHUNK_BYTES) {
      const end = Math.min(offset + ZIP_CHUNK_BYTES, bytes.length);
      unzip.push(bytes.subarray(offset, end), end === bytes.length);
      // Let the browser paint and handle input during larger imports.
      if (end < bytes.length && performance.now() - lastYield >= 8) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    if (seen.size !== entries.size || files.size !== paths.size) throw new Error("Incomplete ZIP archive");
  } catch (error) {
    if (error instanceof CharacterArchiveError) throw error;
    throw new Error("The ZIP could not be opened. Make sure it is a valid, unencrypted archive.");
  }
  return files;
}

export async function loadCharacterPackage(file: PackageFile, objectUrls: ObjectUrlApi = browserObjectUrls): Promise<LoadedCharacterPackage> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a .zip character package.");
  if (file.size > MAX_ZIP_BYTES) throw new Error("Character ZIP is larger than 25 MB.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error("Character ZIP is larger than 25 MB.");
  const files = await extractCharacterFiles(bytes);

  const configs = [...files.keys()].filter((path) => path.split("/").at(-1)?.toLowerCase() === "character.json");
  if (configs.length !== 1) throw new Error(configs.length ? "The ZIP contains more than one character.json." : "The ZIP does not contain character.json.");
  const configPath = configs[0]!;

  let definition: CharacterDefinition;
  try {
    definition = parseCharacterDefinition(JSON.parse(strFromU8(files.get(configPath)!)) as unknown);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("character.json is not valid JSON.");
    throw error;
  }

  const urls: string[] = [];
  const createAssetUrl = (assetPath: string) => {
    const resolvedPath = resolveAssetPath(configPath, assetPath);
    const bytes = files.get(resolvedPath);
    if (!bytes) throw new Error(`Missing referenced asset: ${assetPath}`);
    const url = objectUrls.create(new Blob([bytes.slice().buffer], { type: mimeType(resolvedPath) }));
    urls.push(url);
    return url;
  };

  try {
    const loadedDefinition: CharacterDefinition = {
      ...definition,
      body: { ...definition.body, src: createAssetUrl(definition.body.src) },
      mouth: {
        ...definition.mouth,
        sprites: Object.fromEntries(MOUTH_STATES.map((state) => [state, createAssetUrl(definition.mouth.sprites[state])])) as Record<MouthState, string>,
      },
      eyes: definition.eyes
        ? {
            ...definition.eyes,
            sprites: {
              open: createAssetUrl(definition.eyes.sprites.open),
              closed: createAssetUrl(definition.eyes.sprites.closed),
            },
          }
        : undefined,
    };
    const directoryName = configPath.includes("/") ? configPath.slice(0, configPath.lastIndexOf("/")).split("/").at(-1) : undefined;
    const fallbackName = file.name.replace(/\.zip$/i, "");
    return {
      definition: loadedDefinition,
      name: directoryName || fallbackName || "Custom avatar",
      dispose: () => urls.splice(0).forEach((url) => objectUrls.revoke(url)),
    };
  } catch (error) {
    urls.forEach((url) => objectUrls.revoke(url));
    throw error;
  }
}
