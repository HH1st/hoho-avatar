import { cp, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function fixDeclarationImports(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await fixDeclarationImports(path);
    else if (item.name.endsWith('.d.ts')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replace(/(from\s+["'])(\.[^"']+)(["'])/g, (_match, before, specifier, after) =>
        before + (specifier.endsWith('.js') ? specifier : specifier + '.js') + after));
    }
  }
}
await fixDeclarationImports('dist-sdk/types');

// Only original MIT-licensed artwork ships with the SDK.
const assetDir = 'dist-sdk/characters/pixel-bot';
await mkdir(assetDir, { recursive: true });
await cp('public/characters/pixel-bot', assetDir, { recursive: true });
const character = JSON.parse(await readFile(assetDir + '/character.json', 'utf8'));
const lines = ['const character = ' + JSON.stringify(character, null, 2) + ';'];
const asset = (path) => 'new URL(' + JSON.stringify('./pixel-bot/' + path) + ', import.meta.url).href';
lines.push('character.body.src = ' + asset(character.body.src) + ';');
for (const state of Object.keys(character.mouth.sprites)) lines.push('character.mouth.sprites.' + state + ' = ' + asset(character.mouth.sprites[state]) + ';');
for (const state of Object.keys(character.eyes.sprites)) lines.push('character.eyes.sprites.' + state + ' = ' + asset(character.eyes.sprites[state]) + ';');
lines.push('export default character;');
await writeFile('dist-sdk/characters/pixel-bot.js', lines.join('\n') + '\n');
await writeFile('dist-sdk/characters/pixel-bot.d.ts', [
  'import type { CharacterDefinition } from "../types/core/types.js";',
  'declare const character: CharacterDefinition;',
  'export default character;',
].join('\n') + '\n');
await writeFile(assetDir + '/LICENSE', await readFile('LICENSE'));
