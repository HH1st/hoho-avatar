import { strFromU8, unzipSync } from "fflate";
import { parseCharacterDefinition } from "../../src";
import type { CharacterDefinition, MouthState } from "../../src";

const MAX_ZIP_BYTES = 25 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 75 * 1024 * 1024;
const mouthStates: MouthState[] = ["closed", "small", "large", "wide", "round"];

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
      if (!parts.length) throw new Error(`Asset path escapes the character folder: ${path}`);
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

export async function loadCharacterPackage(file: PackageFile, objectUrls: ObjectUrlApi = browserObjectUrls): Promise<LoadedCharacterPackage> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("Choose a .zip character package.");
  if (file.size > MAX_ZIP_BYTES) throw new Error("Character ZIP is larger than 25 MB.");

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error("The ZIP could not be opened. Make sure it is a valid, unencrypted archive.");
  }

  const files = new Map<string, Uint8Array>();
  let extractedBytes = 0;
  for (const [rawPath, bytes] of Object.entries(entries)) {
    const path = normalizeZipPath(rawPath);
    if (!path || path.startsWith("__MACOSX/") || path.split("/").some((part) => part.startsWith("."))) continue;
    extractedBytes += bytes.byteLength;
    if (extractedBytes > MAX_EXTRACTED_BYTES) throw new Error("Extracted character files are larger than 75 MB.");
    files.set(path, bytes);
  }

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
        sprites: Object.fromEntries(mouthStates.map((state) => [state, createAssetUrl(definition.mouth.sprites[state])])) as Record<MouthState, string>,
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
