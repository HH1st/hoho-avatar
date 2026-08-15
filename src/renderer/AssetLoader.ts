import type { CharacterDefinition } from "../core/types";

export interface LoadedCharacter {
  definition: CharacterDefinition;
  body: HTMLImageElement;
  mouths: Record<string, HTMLImageElement>;
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
    definition = await response.json() as CharacterDefinition;
    baseUrl = configUrl.href;
  } else {
    definition = source;
  }

  const resolve = (path: string) => new URL(path, baseUrl).href;
  const mouthEntries = await Promise.all(Object.entries(definition.mouth.sprites).map(async ([key, path]) => [key, await loadImage(resolve(path))] as const));
  const eyes = definition.eyes
    ? Object.fromEntries(await Promise.all(Object.entries(definition.eyes.sprites).map(async ([key, path]) => [key, await loadImage(resolve(path))]))) as Record<"open" | "closed", HTMLImageElement>
    : undefined;

  return {
    definition,
    body: await loadImage(resolve(definition.body.src)),
    mouths: Object.fromEntries(mouthEntries),
    eyes,
  };
}
