import { test, expect } from '@playwright/test';

// Exercise real queued audio playback without downloading a model or requiring a GPU.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!('gpu' in navigator)) Object.defineProperty(navigator, 'gpu', { value: {} });
    window.ttsCalls = [];
  });
  await page.route(/kitten-tts-webgpu/, (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `export async function textToSpeech(text, options) {
      window.ttsCalls.push({ text, voice: options.voice, speed: options.speed });
      options.onProgress?.('Generating speech');
      await new Promise((resolve) => { window.finishSynthesis = resolve; });
      return (await fetch('/hoho-avatar/audio/sample-voice.wav')).blob();
    }`,
  }));
  await page.goto('./');
  await expect(page.locator('.stage-wrap')).toHaveAttribute('data-loaded', 'true');
  await page.locator('#tab-tts').click();
});

for (const mode of ['smooth', 'stream']) {
  test(`local TTS ${mode} preserves edited text and plays through the shared stage`, async ({ page }) => {
    await page.locator('#ttsText').fill('A short hello.');
    await page.locator('[data-avatar="pixel-bot"]').click();
    await expect(page.locator('[data-avatar="pixel-bot"]')).toBeEnabled();
    await expect(page.locator('#ttsText')).toHaveValue('A short hello.');
    await page.locator('#ttsMode').selectOption(mode);
    await page.locator('#ttsVoice').selectOption('Luna');
    await page.locator('#ttsSpeed').selectOption('1.2');
    await page.locator('#ttsSpeakButton').click();
    await expect.poll(() => page.evaluate(() => window.ttsCalls)).toEqual([
      { text: 'A short hello.', voice: 'Luna', speed: 1.2 },
    ]);
    await expect(page.locator('#ttsText')).toBeDisabled();
    await expect(page.locator('#ttsSpeakButton')).toBeDisabled();
    await page.evaluate(() => window.finishSynthesis());
    await expect(page.locator('#statusText')).toHaveText('TTS LIVE');
    await page.locator('#ttsStopButton').click();
    await expect(page.locator('#statusText')).toHaveText('STANDBY');
    await expect(page.locator('#ttsSpeakButton')).toBeEnabled();
    await expect(page.locator('#mouthState')).toHaveText('CLOSED');
  });
}

test('finishing cancelled TTS unlocks controls independently of the displayed status label', async ({ page }) => {
  await page.locator('#ttsSpeakButton').click();
  await expect.poll(() => page.evaluate(() => window.ttsCalls.length)).toBe(1);
  await page.locator('#ttsStopButton').click();
  await expect(page.locator('#statusText')).toHaveText('TTS STOPPING');
  await expect(page.locator('#ttsSpeakButton')).toBeDisabled();
  await page.locator('#statusText').evaluate((node) => { node.textContent = 'Display text can change'; });
  await page.evaluate(() => window.finishSynthesis());
  await expect(page.locator('#ttsSpeakButton')).toBeEnabled();
  await expect(page.locator('#ttsStatus')).toHaveText('READY // ENGLISH / WEBGPU');
  await expect(page.locator('#statusText')).toHaveText('STANDBY');
  await expect(page.locator('#ttsStopButton')).toBeDisabled();
});
