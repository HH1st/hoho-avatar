import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { live2dSampleFiles } from './live2d-sample-manifest.mjs';

// Cache outside source/public. build:pages is the explicit site distribution path.
const root = resolve('tmp/live2d-sample');
await mkdir(root, { recursive: true });
const sources = {};
for (const [name, entry] of Object.entries(live2dSampleFiles)) {
  const path = resolve(root, name);
  let bytes;
  try {
    const cached = await readFile(path);
    if (entry.sha256 && createHash('sha256').update(cached).digest('hex') === entry.sha256) bytes = cached;
  } catch { /* Download uncached files. */ }
  if (!bytes) {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error('Download failed: ' + entry.url + ' (' + response.status + ')');
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (entry.sha256 && sha256 !== entry.sha256) throw new Error('Live2D checksum mismatch: ' + name + '. Review upstream changes before updating the manifest.');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  sources[name] = { url: entry.url, sha256 };
}
await writeFile(resolve(root, 'sources.json'), JSON.stringify({ sources }, null, 2));
console.log('Verified Live2D sample ready for local development or npm run build:pages.');
console.log('This content uses sample data owned and copyrighted by Live2D Inc. Official model/Core license documents are included.');
console.log('Runtime and model remain excluded from the SDK and source tree.');
