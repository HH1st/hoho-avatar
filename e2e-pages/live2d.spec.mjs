import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { live2dSampleFiles } from '../scripts/live2d-sample-manifest.mjs';

test('Pages artifact contains pinned Live2D resources and license notices', async ({ request }) => {
  for (const [name, entry] of Object.entries(live2dSampleFiles)) {
    const response = await request.get('live2d/' + name);
    expect(response.ok(), name).toBe(true);
    const bytes = await response.body();
    expect(bytes.length, name).toBeGreaterThan(0);
    if (entry.sha256) expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(entry.sha256);
  }
  const metadata = await request.get('live2d/sources.json');
  expect((await metadata.json()).files).toHaveLength(Object.keys(live2dSampleFiles).length);
});

test('production page loads Live2D locally, displays credit and plays audio', async ({ page }) => {
  const errors = []; const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('./?character=live2d');
  await expect(page.locator('[data-avatar="live2d"]')).toBeVisible();
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('#stageLabel')).toHaveText('Wankoromochi');
  await expect(page.locator('#live2dCredit')).toBeVisible();
  await page.locator('[data-mouth="large"]').click();
  await expect(page.locator('[data-mouth="large"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#demoSampleButton').click();
  await expect(page.locator('#statusText')).toHaveText('AUDIO LIVE');
  await page.locator('#audioStopButton').click();
  const origin = new URL(page.url()).origin;
  const resources = requests.filter((url) => /Wanko|live2dcubismcore/.test(url));
  expect(resources.length).toBeGreaterThanOrEqual(4);
  expect(resources.every((url) => url.startsWith(origin + '/hoho-avatar/live2d/'))).toBe(true);
  expect(requests.some((url) => url.includes('/__live2d/'))).toBe(false);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'tmp/live2d-pages.png', fullPage: true });
});

test('a 2D visit does not load Live2D until selected', async ({ page }) => {
  const requests = []; page.on('request', (request) => requests.push(request.url()));
  await page.goto('./');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  const portrait = page.locator('#live2dPreview');
  await expect(portrait).toBeVisible();
  await expect.poll(() => portrait.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(requests.some((url) => /cubism|pixi|\/live2d\/Wanko/i.test(url))).toBe(false);
  await page.locator('[data-avatar="live2d"]').click();
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('#stageLabel')).toHaveText('Wankoromochi');
});
