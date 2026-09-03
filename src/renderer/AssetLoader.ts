import { parseCharacterDefinition } from "../core/CharacterDefinition";
import type { CharacterDefinition, MouthState } from "../core/types";

export interface LoadedCharacter {
  definition: CharacterDefinition;
  body: HTMLImageElement;
  mouths: Record<MouthState, HTMLImageElement>;
  eyes?: Record<"open" | "closed", HTMLImageElement>;
}

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Unable to load sprite: ${src}`));
  image.src = src;
});

export async function loadCharacter(source: string | CharacterDefinition): Promise<LoadedCharacter> {
  let definition: CharacterDefinition;
  let baseUrl = document.baseURI;

  if (typeof source === "string") {
    const configUrl = new URL(source, document.baseURI);
    const response = await fetch(configUrl);
    if (!response.ok) throw new Error(`Unable to load character: ${response.status}`);
    definition = parseCharacterDefinition(await response.json());
    baseUrl = configUrl.href;
  } else {
    definition = parseCharacterDefinition(source);
  }

  const resolve = (path: string) => new URL(path, baseUrl).href;
  const mouthPromise = Promise.all(
    Object.entries(definition.mouth.sprites).map(async ([key, path]) => [key, await loadImage(resolve(path))] as const),
  );
  const eyesPromise = definition.eyes
    ? Promise.all(Object.entries(definition.eyes.sprites).map(async ([key, path]) => [key, await loadImage(resolve(path))] as const))
    : undefined;
  const [body, mouthEntries, eyeEntries] = await Promise.all([
    loadImage(resolve(definition.body.src)),
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
