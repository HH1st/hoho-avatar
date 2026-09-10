import { test, expect } from '@playwright/test';

async function choose(page, character) {
  await page.locator('[data-avatar="' + character + '"]').click();
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('[data-avatar="' + character + '"]')).toBeEnabled();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.testTracks = []; window.testContexts = []; window.lostContexts = 0; window.maxEnergy = 0;
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (options) => { const stream = await capture(options); window.testTracks.push(...stream.getTracks()); return stream; };
    const Context = AudioContext;
    window.AudioContext = class extends Context { constructor(...args) { super(...args); window.testContexts.push(this); } };
  });
});
test('one studio switches 2D and 3D without loading Three.js for a 2D visit', async ({ page }) => {
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  expect(requests.some((url) => /three(?:\.js|\/|\.module)/.test(url))).toBe(false);
  await choose(page, 'mochi');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-renderer', '3d');
  await expect(page.locator('#modelTools')).toBeVisible();
  for (const mouth of ['closed', 'small', 'large', 'wide', 'round']) {
    await page.locator('[data-mouth="' + mouth + '"]').click();
    await expect(page.locator('[data-mouth="' + mouth + '"]')).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('#resetView').click();
  await page.locator('#avatar').evaluate((canvas) => canvas.addEventListener('webglcontextlost', () => window.lostContexts++));
  await choose(page, 'pixel-bot');
  await expect(page.locator('#modelTools')).toBeVisible();
  await expect(page.locator('#resetView')).toBeHidden();
  await page.locator('[data-mouth="round"]').click();
  await expect(page.locator('[data-mouth="round"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#avatar')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.lostContexts)).toBe(1);
  await choose(page, 'mochi');
  await page.screenshot({ path: 'tmp/unified-studio.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('changing audio providers and replaying a sample preserves the loaded model and canvas', async ({ page }) => {
  const models = [];
  page.on('request', (request) => { if (request.url().endsWith('/models/mochi/mochi.glb')) models.push(request.url()); });
  await page.goto('./?character=mochi');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await page.evaluate(() => { window.firstCanvas = document.querySelector('#avatar'); });
  for (const provider of ['file', 'tts', 'mic', 'file']) await page.locator('#tab-' + provider).click();
  for (let i = 0; i < 2; i++) {
    await page.locator('#sampleAudioButton').click();
    await expect(page.locator('#statusText')).toHaveText('AUDIO LIVE');
    await page.locator('#audioStopButton').click();
  }
  expect(models).toHaveLength(1);
  expect(await page.evaluate(() => document.querySelector('#avatar') === window.firstCanvas)).toBe(true);
});
test('the same microphone and file controls drive either renderer', async ({ page }) => {
  await page.goto('./?character=mochi');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await page.locator('#micButton').click();
  await expect(page.locator('#statusText')).toHaveText('MIC LIVE');
  await choose(page, 'pixel-bot');
  await expect(page.locator('#statusText')).toHaveText('MIC LIVE');
  expect(await page.evaluate(() => window.testTracks.filter((track) => track.readyState === 'live').length)).toBe(1);
  await page.locator('#micButton').click();
  await expect.poll(() => page.evaluate(() => window.testTracks.every((track) => track.readyState === 'ended'))).toBe(true);
  await choose(page, 'mochi');
  await page.locator('#demoSampleButton').click();
  await expect(page.locator('#statusText')).toHaveText('AUDIO LIVE');
  await page.locator('#audioStopButton').click();
  await expect(page.locator('#mouthState')).toHaveText('CLOSED');
  await page.locator('#tab-mic').click();
  await expect.poll(() => page.evaluate(() => window.testContexts.every((context) => context.state === 'closed'))).toBe(true);
});
test('GLB import uses the shared picker and recovers the previous character on failure', async ({ page }) => {
  await page.goto('./');
  await page.locator('#avatarFile').setInputFiles('public/models/mochi/mochi.glb');
  await expect(page.locator('#customModelButton')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#stageLabel')).toHaveText('mochi');
  await expect(page.locator('#uploadButton')).toBeEnabled();
  await page.locator('#avatarFile').setInputFiles({ name: 'broken.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from('bad') });
  await expect(page.locator('#uploadStatus')).toContainText('binary glTF');
  await expect(page.locator('#stageLabel')).toHaveText('mochi');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
});
test('3D remains visible with voice controls on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?character=mochi');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await page.locator('#micButton').scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth, viewport: innerWidth,
    canvas: document.querySelector('#avatar').getBoundingClientRect().toJSON(),
    button: document.querySelector('#micButton').getBoundingClientRect().toJSON(),
  }));
  expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  expect(layout.canvas.top).toBeGreaterThanOrEqual(0);
  expect(layout.canvas.bottom).toBeLessThanOrEqual(layout.button.top);
  await page.screenshot({ path: 'tmp/unified-mobile.png', fullPage: true });
});
