import { test, expect } from "@playwright/test";

async function expectPreviewAndControl(page, selector) {
  await expect.poll(() => page.evaluate((selector) => {
    const canvas = document.querySelector("#avatar");
    const control = document.querySelector(selector);
    const preview = canvas.getBoundingClientRect();
    const target = control.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? innerHeight);
    const hit = document.elementFromPoint(target.x + target.width / 2, target.y + target.height / 2);
    return preview.top >= top && preview.bottom <= bottom
      && target.top >= preview.bottom && target.bottom <= bottom
      && (hit === control || control.contains(hit));
  }, selector)).toBe(true);
}

for (const size of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`preview remains visible while operating controls at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("./");
    for (const [mode, selector] of [["mic", "#micButton"], ["file", "#sampleAudioButton"], ["tts", "#ttsSpeakButton"], ["agent", "#agentConnectButton"]]) {
      await page.locator(`#tab-${mode}`).click();
      await page.locator(selector).scrollIntoViewIfNeeded();
      await expectPreviewAndControl(page, selector);
    }
    await expect(page.locator("#avatar")).toHaveCount(1);
  });
}

test("mobile microphone and sample playback keep the live avatar beside their stop controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator("#micButton").click();
  await expect(page.locator("#statusText")).toHaveText("MIC LIVE");
  await expectPreviewAndControl(page, "#micButton");
  await page.locator("#micButton").click();
  await page.locator("#demoSampleButton").click();
  await expect(page.locator("#statusText")).toHaveText("AUDIO LIVE");
  await page.locator("#audioStopButton").scrollIntoViewIfNeeded();
  await expectPreviewAndControl(page, "#audioStopButton");
  await page.locator("#audioStopButton").click();
});

test("mobile conversation keeps the avatar visible when starting, interrupting and ending", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let socket;
  await page.route("**/voice-agent/healthz", (route) => route.fulfill({ json: { ok: true } }));
  await page.routeWebSocket(/\/voice-agent$/, (connection) => {
    socket = connection;
    connection.onMessage((data) => {
      if (JSON.parse(String(data)).type === "session.configure") connection.send(JSON.stringify({ type: "session.ready" }));
    });
    connection.send(JSON.stringify({ type: "gateway.ready" }));
  });
  await page.goto("./");
  await page.locator("#tab-agent").click();
  await page.locator("#agentConnectButton").click();
  await expect(page.locator("#agentStatus")).toHaveText("LISTENING");
  await expectPreviewAndControl(page, "#agentConnectButton");
  socket.send(JSON.stringify({ type: "response.started" }));
  socket.send(JSON.stringify({ type: "output.audio.delta", audio: Buffer.alloc(48000 * 3).toString("base64") }));
  await expect(page.locator("#agentStatus")).toHaveText("SPEAKING");
  await page.locator("#agentInterruptButton").click();
  await expectPreviewAndControl(page, "#agentInterruptButton");
  await page.locator("#agentDisconnectButton").click();
  await expect(page.locator("#agentStatus")).toHaveText("DISCONNECTED");
  await expectPreviewAndControl(page, "#agentDisconnectButton");
});

test("a reduced viewport leaves text entry and the avatar usable together", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.locator("#tab-tts").click();
  await page.locator("#ttsText").focus();
  // Approximate the space left by a software keyboard; real keyboards need device QA.
  await page.setViewportSize({ width: 390, height: 360 });
  await page.locator("#ttsText").scrollIntoViewIfNeeded();
  await expectPreviewAndControl(page, "#ttsText");
  await page.locator("#ttsText").fill("Still in view.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#ttsSpeakButton").scrollIntoViewIfNeeded();
  await expectPreviewAndControl(page, "#ttsSpeakButton");
});

test("choosing another character keeps its live preview visible above the cast", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  const selector = ".character-choice[data-avatar=\"pixel-bot\"]";
  await page.locator(selector).click();
  await expect(page.locator("#stageLabel")).toHaveText("Pixel Bot");
  await expectPreviewAndControl(page, selector);
});
