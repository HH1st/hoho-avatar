import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Development fixture only. Never copied to public/ or the npm package.
const root = resolve('tmp/live2d-sample');
const sampleBase = 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/develop/Samples/Resources/Wanko/';
const sources = {
  'live2dcubismcore.min.js': 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  'LICENSE.samples.md': 'https://raw.githubusercontent.com/Live2D/CubismWebSamples/develop/LICENSE.md',
  'FreeMaterialLicense.html': 'https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html',
  'SampleModelTerms.html': 'https://www.live2d.com/eula/live2d-sample-model-terms_en.html',
  'CoreLicense.html': 'https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html',
};
for (const name of ['Wanko.model3.json', 'Wanko.moc3', 'Wanko.physics3.json', 'Wanko.1024/texture_00.png']) sources['Wanko/' + name] = sampleBase + name;
await mkdir(root, { recursive: true });
for (const [name, url] of Object.entries(sources)) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Download failed: ' + url + ' (' + response.status + ')');
  const path = resolve(root, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
}
await writeFile(resolve(root, 'sources.json'), JSON.stringify({ downloadedAt: new Date().toISOString(), sources }, null, 2));
console.log('Development sample ready. Restart npm run dev and select Wankoromochi (Live2D).');
console.log('This content uses sample data owned and copyrighted by Live2D Inc. Sample/Core terms are saved beside the fixture.');
console.log('The sample and proprietary Cubism Core remain in ignored tmp/; production hosts must supply licensed assets.');
