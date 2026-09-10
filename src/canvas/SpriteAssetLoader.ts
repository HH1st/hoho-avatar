import { parseSpriteCharacterDefinition } from "./parseSpriteCharacter";
import type { SpriteCharacterDefinition } from "./SpriteCharacterDefinition";
import type { MouthState } from "../core/types";
import { MOUTH_STATES } from '../core/MouthState';

export interface LoadedSpriteCharacter {
  definition: SpriteCharacterDefinition;
  body: HTMLImageElement;
  mouths: Record<MouthState, HTMLImageElement>;
  eyes?: Record<"open" | "closed", HTMLImageElement>;
}

const loadImage = (src: string, signal?: AbortSignal): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  signal?.throwIfAborted();
  const image = new Image();
  const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); };
  const abort = () => { cleanup(); reject(signal?.reason); };
  signal?.addEventListener('abort', abort, { once: true });
  image.onload = () => { cleanup(); resolve(image); };
  image.onerror = () => { cleanup(); reject(new Error(`Unable to load sprite: ${src}`)); };
  image.src = src;
});

export async function loadSpriteCharacter(source: string | SpriteCharacterDefinition, signal?: AbortSignal): Promise<LoadedSpriteCharacter> {
  signal?.throwIfAborted();
  let definition: SpriteCharacterDefinition;
  let baseUrl = document.baseURI;

  if (typeof source === "string") {
    const configUrl = new URL(source, document.baseURI);
    const response = await fetch(configUrl, { signal });
    if (!response.ok) throw new Error(`Unable to load character: ${response.status}`);
    definition = parseSpriteCharacterDefinition(await response.json());
    baseUrl = configUrl.href;
  } else {
    definition = parseSpriteCharacterDefinition(source);
  }

  const resolve = (path: string) => new URL(path, baseUrl).href;
  const mouthPromise = Promise.all(
    MOUTH_STATES.map(async (state) => [state, await loadImage(resolve(definition.mouth.sprites[state]), signal)] as const),
  );
  const eyesPromise = definition.eyes
    ? Promise.all(Object.entries(definition.eyes.sprites).map(async ([key, path]) => [key, await loadImage(resolve(path), signal)] as const))
    : undefined;
  const [body, mouthEntries, eyeEntries] = await Promise.all([
    loadImage(resolve(definition.body.src), signal),
    mouthPromise,
    eyesPromise,
  ]);

  return {
    definition,
    body,
    mouths: Object.fromEntries(mouthEntries) as Record<MouthState, HTMLImageElement>,
    eyes: eyeEntries ? Object.fromEntries(eyeEntries) as Record<"open" | "closed", HTMLImageElement> : undefined,
  };
}
