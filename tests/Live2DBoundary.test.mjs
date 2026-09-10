import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? sources(directory + '/' + entry.name)
    : entry.name.endsWith('.ts') ? [directory + '/' + entry.name] : []));
  return paths.flat();
}

describe('Live2D dependency boundary', () => {
  it('contains third-party imports and Cubism internals inside the private adapter', async () => {
    for (const path of await sources('src/live2d')) {
      if (path.includes('/internal/')) continue;
      const source = await readFile(path, 'utf8');
      const violations = source.match(/['"](?:pixi\.js|pixi-live2d-display|@pixi\/)[^'"]*['"]|\b(?:internalModel|Live2DCubismCore|Cubism4ModelSettings|Live2DFactory)\b/g) ?? [];
      expect(violations, path).toEqual([]);
    }
  });

  it('does not import a renderer implementation into the SDK core', async () => {
    for (const path of [...await sources('src/core'), 'src/index.ts']) {
      const source = await readFile(path, 'utf8');
      const imports = [...source.matchAll(/(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((item) => item[1]);
      expect(imports.filter((name) => /live2d|pixi|cubism|three|\/canvas\//i.test(name)), path).toEqual([]);
    }
  });
});
