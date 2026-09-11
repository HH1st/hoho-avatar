import type { RendererFactory } from '../../src';
import { canvasRenderer } from '../../src/canvas';
import type { SpriteCharacterDefinition } from '../../src/canvas';
import { live2dConfig } from './studioConfig';
import { wankoromochiViewBox } from './live2dPresentation';

interface CharacterInfo {
  id: string;
  label: string;
  defaultText: string;
}
export type StudioCharacter = CharacterInfo & (
  | { renderer: '2d'; source: string | SpriteCharacterDefinition }
  | { renderer: '3d'; source: string | ArrayBuffer }
  | { renderer: 'live2d'; source: string }
);

export function createCharacterCatalog(): Map<string, StudioCharacter> {
  const characters: StudioCharacter[] = [
    { id: 'niu-lai', renderer: '2d', source: import.meta.env.BASE_URL + 'characters/niu-lai/character.json',
      label: 'Niu Lai', defaultText: "Hey, I'm Niu Lai. How's your day so far?" },
    { id: 'pixel-bot', renderer: '2d', source: import.meta.env.BASE_URL + 'characters/pixel-bot/character.json',
      label: 'Pixel Bot', defaultText: "Hey, I'm Pixel Bot. What's been the best part of your day?" },
    { id: 'pixel-portrait', renderer: '2d', source: import.meta.env.BASE_URL + 'characters/pixel-portrait/character.json',
      label: 'Pixel Portrait', defaultText: "Hey there. How's your day treating you?" },
    { id: 'mochi', renderer: '3d', source: import.meta.env.BASE_URL + 'models/mochi/mochi.glb',
      label: 'Mochi', defaultText: "Hey, I'm Mochi. What's on your mind?" },
  ];
  if (live2dConfig.modelUrl) {
    characters.push({ id: 'live2d', renderer: 'live2d', source: live2dConfig.modelUrl,
      label: live2dConfig.name, defaultText: "Hello! It's nice to meet you." });
  }
  return new Map(characters.map((character) => [character.id, character]));
}

/** Optional renderer dependencies are fetched only when their character is selected. */
export async function createCharacterRenderer(character: StudioCharacter): Promise<RendererFactory> {
  switch (character.renderer) {
    case 'live2d':
      return (await import('../../src/live2d')).live2dRenderer({
        model: character.source, coreUrl: live2dConfig.coreUrl || undefined,
        ...(live2dConfig.usesSample ? { viewBox: wankoromochiViewBox, padding: 0.12 } : {}),
      });
    case '3d':
      return (await import('../../src/three')).threeRenderer({ model: character.source, background: null });
    case '2d':
      return canvasRenderer({ character: character.source });
  }
}
