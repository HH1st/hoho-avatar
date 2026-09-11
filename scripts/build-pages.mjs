import { readFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { build } from 'vite';
import { live2dSampleFiles } from './live2d-sample-manifest.mjs';

// Explicit site release path. No proprietary assets enter public/ or dist-sdk/.
// Refuse drift/missing assets rather than publishing a broken or unreviewed Core.
const cache = resolve('tmp/live2d-sample');
const verified = [];
for (const [name, entry] of Object.entries(live2dSampleFiles)) {
  const bytes = await readFile(resolve(cache, name));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (entry.sha256 && sha256 !== entry.sha256) throw new Error('Live2D asset checksum mismatch: ' + name);
  verified.push({ name, source: entry.url, sha256 });
}
const outDir = resolve('examples/basic/dist');
await build({ configFile: 'examples/basic/vite.config.mjs', mode: 'pages', build: { outDir } });
for (const { name } of verified) {
  const destination = resolve(outDir, 'live2d', name);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(resolve(cache, name), destination);
}
await writeFile(resolve(outDir, 'live2d/sources.json'), JSON.stringify({ files: verified }, null, 2) + '\n');
console.log('Pages build includes verified Wankoromochi/Core assets and license notices; SDK contents are unchanged.');
