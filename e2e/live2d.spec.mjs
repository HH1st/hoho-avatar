import { test, expect } from '@playwright/test';
import { hasLive2DSample } from '../examples/basic/live2dSample.mjs';

test.describe('Live2D official local fixture', () => {
  test.skip(!hasLive2DSample, 'Run npm run setup:live2d-sample to enable actual Cubism verification.');
  test('shares the same page, expressions, audio and cleanup as other renderers', async ({ page }) => {
    const errors = []; const resources = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => resources.push(request.url()));
    await page.addInitScript(() => {
      window.live2dTracks = []; window.live2dContexts = []; window.revoked = [];
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (options) => { const stream = await capture(options); window.live2dTracks.push(...stream.getTracks()); return stream; };
      const Context = AudioContext;
      window.AudioContext = class extends Context { constructor(...args) { super(...args); window.live2dContexts.push(this); } };
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url) => { window.revoked.push(url); revoke(url); };
    });
    await page.goto('./');
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
    expect(resources.some((url) => /pixi|cubism|\/live2d\//i.test(url))).toBe(false);
    await page.locator('[data-avatar="live2d"]').click();
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
    await expect(page.locator('#stageLabel')).toHaveText('Wankoromochi');
    for (const state of ['closed', 'small', 'large', 'wide', 'round']) {
      await page.locator('[data-mouth="' + state + '"]').click();
      await expect(page.locator('[data-mouth="' + state + '"]')).toHaveAttribute('aria-pressed', 'true');
    }
    await page.locator('#blinkPreview').click();
    await page.locator('#resetView').click();
    const before = resources.filter((url) => url.endsWith('Wanko.model3.json')).length;
    await page.locator('#demoSampleButton').click();
    await expect(page.locator('#statusText')).toHaveText('AUDIO LIVE');
    await page.locator('#audioStopButton').click();
    expect(resources.filter((url) => url.endsWith('Wanko.model3.json')).length).toBe(before);
    await page.locator('#tab-mic').click();
    await page.locator('#micButton').click();
    await expect(page.locator('#statusText')).toHaveText('MIC LIVE');
    await page.locator('#micButton').click();
    await expect.poll(() => page.evaluate(() => window.live2dTracks.every((track) => track.readyState === 'ended'))).toBe(true);
    await expect.poll(() => page.evaluate(() => window.live2dContexts.every((context) => context.state === 'closed'))).toBe(true);
    await page.locator('[data-avatar="pixel-bot"]').click();
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
    expect(await page.evaluate(() => window.revoked.length)).toBeGreaterThanOrEqual(3);
    await page.locator('[data-avatar="live2d"]').click();
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
    await page.screenshot({ path: 'tmp/live2d-verified.png', fullPage: true });
    expect(errors).toEqual([]);
  });
  test('switching character cancels Live2D fetches without late updates', async ({ page }) => {
    let requested = false;
    await page.route('**/__live2d/Wanko/Wanko.moc3', async (route) => { requested = true; await new Promise((resolve) => setTimeout(resolve, 800)); await route.abort(); });
    await page.goto('./?character=live2d');
    await expect.poll(() => requested).toBe(true);
    await page.locator('[data-avatar="pixel-bot"]').click();
    await expect(page.locator('#stageLabel')).toHaveText('Pixel Bot');
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
    await expect(page.locator('#avatar')).toHaveCount(1);
  });
  test('Live2D uses the shared voice session on a mobile stage', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let socket;
    await page.route('**/voice-agent/healthz', (route) => route.fulfill({ json: { ok: true } }));
    await page.routeWebSocket(/\/voice-agent$/, (connection) => {
      socket = connection;
      connection.onMessage((data) => { if (JSON.parse(String(data)).type === 'session.configure') connection.send(JSON.stringify({ type: 'session.ready' })); });
      connection.send(JSON.stringify({ type: 'gateway.ready' }));
    });
    await page.goto('./?character=live2d');
    await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
    await page.locator('#tab-agent').click();
    await page.locator('#agentConnectButton').click();
    await expect(page.locator('#agentStatus')).toHaveText('LISTENING');
    socket.send(JSON.stringify({ type: 'response.started' }));
    socket.send(JSON.stringify({ type: 'output.audio.delta', audio: Buffer.alloc(48_000, 20).toString('base64') }));
    await expect(page.locator('#agentStatus')).toHaveText('SPEAKING');
    await page.locator('#agentInterruptButton').click();
    await page.locator('#agentDisconnectButton').click();
    await expect(page.locator('#agentStatus')).toHaveText('DISCONNECTED');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'tmp/live2d-mobile.png', fullPage: true });
  });
});
