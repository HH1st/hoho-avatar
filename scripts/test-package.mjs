import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, cp, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const root = process.cwd();
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run with npm run test:package');
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', windowsHide: true, env: { ...process.env, npm_config_cache: join(root, 'npm-cache') } });
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  return result.stdout;
}
console.log('Building SDK and packing the public artifact…');
run([npm, 'run', 'build:sdk']);
const [packed] = JSON.parse(run([npm, 'pack', '--json', '--ignore-scripts']));
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'));
assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org');
assert.ok(Object.values(lockfile.packages).every((entry) => !entry.resolved || entry.resolved.startsWith('https://registry.npmjs.org/')), 'Dependencies must resolve from the public npm registry');
assert.equal(Object.keys(manifest.dependencies || {}).length, 0, 'SDK must not install Azure/TTS/demo dependencies');
assert.ok(packed.files.every(({ path }) => /^(dist-sdk\/|README\.md$|LICENSE$|package\.json$|docs\/SDK\.md$|CHANGELOG\.md$)/.test(path)), 'Unexpected files in package');
assert.ok(!packed.files.some(({ path }) => /niu-lai|pixel-portrait|espeak|en_rules|\.env/.test(path)), 'Non-SDK assets in package');
for (const name of ['dist-sdk/index.js', 'dist-sdk/types/index.d.ts', 'dist-sdk/audio-clip-processor.js', 'dist-sdk/characters/pixel-bot/body.png']) {
  assert.ok(packed.files.some(({ path }) => path === name), 'Missing package file: ' + name);
}
const sdkMap = JSON.parse(await readFile('dist-sdk/index.js.map', 'utf8'));
assert.ok(sdkMap.sources.length > 0 && sdkMap.mappings.length > 0, 'SDK source map must be usable');
await mkdir('tmp', { recursive: true });
const fixture = await mkdtemp(join(root, 'tmp', 'sdk-consumer-'));
await cp('examples/sdk-quickstart', fixture, { recursive: true });
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'sdk-consumer-test', private: true, type: 'module' }));
run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--cache', join(root, 'npm-cache'), resolve(packed.filename)], fixture);
assert.ok(!(await readFile(join(fixture, 'package-lock.json'), 'utf8')).includes('kitten-tts'));
// Compile public declarations under NodeNext without ambient Vite or test types.
run([join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], fixture);
run(['--input-type=module', '-e', 'const sdk = await import("@hh1st/hoho-avatar"); if (typeof sdk.createAvatar !== "function") throw Error("Missing SDK API");'], fixture);
await mkdir(join(fixture, 'public'), { recursive: true });
await cp('public/audio/sample-voice.wav', join(fixture, 'public/sample.wav'));

// A plain static server exercises native ESM; a Vite production build exercises asset rewriting.
const html = await readFile(join(fixture, 'index.html'), 'utf8');
const imports = { imports: { '@hh1st/hoho-avatar': './node_modules/@hh1st/hoho-avatar/dist-sdk/index.js', '@hh1st/hoho-avatar/characters/pixel-bot': './node_modules/@hh1st/hoho-avatar/dist-sdk/characters/pixel-bot.js' } };
await writeFile(join(fixture, 'plain.html'), html.replace('<script type="module"', '<script type="importmap">' + JSON.stringify(imports) + '</script><script type="module"').replace('./main.ts', './plain/main.js'));
await cp('public/audio/sample-voice.wav', join(fixture, 'sample.wav'));
await build({ root: fixture, configFile: false, base: '/nested/', logLevel: 'error', build: { outDir: 'built', emptyOutDir: true } });

const mime = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json' };
const servedWorklets = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname.startsWith('/native/') ? pathname.slice(8) : pathname.startsWith('/nested/') ? 'built/' + pathname.slice(8) : '';
    const path = resolve(fixture, relative || '.');
    if (!path.startsWith(fixture + sep)) { response.writeHead(404).end(); return; }
    const target = (await stat(path)).isDirectory() ? join(path, 'index.html') : path;
    response.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'" });
    const content = await readFile(target);
    if (content.toString().includes('registerProcessor(')) servedWorklets.push(request.url);
    response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  for (const path of ['/native/plain.html', '/nested/']) {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    const errors = [];
    const workletsBefore = servedWorklets.length;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.tracks = []; window.contexts = [];
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (options) => { const stream = await capture(options); window.tracks.push(...stream.getTracks()); return stream; };
      const Context = AudioContext;
      window.AudioContext = class extends Context { constructor(...args) { super(...args); window.contexts.push(this); } };
    });
    await page.goto(origin + path);
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready');
    await page.waitForFunction(() => { const c=document.querySelector('canvas');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0); });
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Playing');
    await page.waitForFunction(() => Number(document.querySelector('#frames').textContent) > 3);
    await page.click('#stop');
    await page.waitForFunction(() => window.contexts.every((context) => context.state === 'closed'));
    const before = Number(await page.locator('#frames').textContent());
    await page.click('#mic');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Listening');
    await page.waitForFunction((before) => Number(document.querySelector('#frames').textContent) > before + 3, before);
    await page.click('#destroy');
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Destroyed');
    assert.ok(await page.evaluate(() => window.tracks.every((track) => track.readyState === 'ended') && window.contexts.every((context) => context.state === 'closed')));
    assert.ok(servedWorklets.length > workletsBefore, 'Worklet must be a served JS asset');
    assert.deepEqual(errors, []);
    console.log('PASS ' + path + ': installed tarball, character, audio worklet PCM, microphone, cleanup');
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log(JSON.stringify({ artifact: packed.filename, bytes: packed.size, unpackedBytes: packed.unpackedSize, files: packed.files.length }));
