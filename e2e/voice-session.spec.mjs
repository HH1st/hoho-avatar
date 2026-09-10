import { test, expect } from "@playwright/test";

async function setup(page, { ready = true, healthy = true } = {}) {
  const sockets = [];
  const messages = [];
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.testTracks = [];
    window.testContexts = [];
    window.holdMicrophone = false;
    navigator.mediaDevices.getUserMedia = async (options) => {
      if (window.denyMicrophone) throw new DOMException("Microphone permission denied", "NotAllowedError");
      const stream = await capture(options);
      window.testTracks.push(...stream.getTracks());
      if (window.holdMicrophone) await new Promise((resolve) => { window.releaseMicrophone = resolve; });
      return stream;
    };
    const Context = window.AudioContext;
    window.AudioContext = class extends Context { constructor(...args) { super(...args); window.testContexts.push(this); } };
  });
  await page.route("**/voice-agent/healthz", (route) => route.fulfill({ status: healthy ? 200 : 503, json: { ok: healthy } }));
  await page.routeWebSocket(/\/voice-agent$/, (socket) => {
    sockets.push(socket);
    socket.onMessage((data) => {
      const event = JSON.parse(String(data));
      messages.push(event);
      if (event.type === "session.configure" && ready) socket.send(JSON.stringify({ type: "session.ready" }));
    });
    socket.send(JSON.stringify({ type: "gateway.ready" }));
  });
  await page.goto("./");
  await page.getByRole("tab", { name: /VOICE AGENT/ }).click();
  return { sockets, messages, errors, send: (event) => sockets.at(-1).send(JSON.stringify(event)) };
}

async function start(page) {
  await page.locator("#agentConnectButton").click();
  await expect(page.locator("#agentStatus")).toHaveText("LISTENING");
}
async function released(page) {
  await expect.poll(() => page.evaluate(() => window.testTracks.every((track) => track.readyState === "ended"))).toBe(true);
  await expect.poll(() => page.evaluate(() => window.testContexts.every((context) => context.state === "closed"))).toBe(true);
}

test("repeated start/end and duplicate clicks leave no capture or playback behind", async ({ page }) => {
  const mock = await setup(page);
  for (let index = 0; index < 3; index += 1) {
    await page.locator("#agentConnectButton").evaluate((button) => { button.click(); button.click(); });
    await expect(page.locator("#agentStatus")).toHaveText("LISTENING");
    expect(mock.sockets).toHaveLength(index + 1);
    await expect.poll(() => mock.messages.filter((event) => event.type === "input.audio").length).toBeGreaterThan(0);
    await page.locator("#agentDisconnectButton").click();
    await expect(page.locator("#agentStatus")).toHaveText("DISCONNECTED");
    await released(page);
  }
  expect(mock.errors).toEqual([]);
});

test("cancel during handshake then retry uses a fresh session", async ({ page }) => {
  const mock = await setup(page, { ready: false });
  await page.locator("#agentConnectButton").click();
  await expect.poll(() => mock.messages.length).toBe(1);
  await page.locator("#agentDisconnectButton").click();
  await expect(page.locator("#agentStatus")).toHaveText("DISCONNECTED");
  await released(page);
  await page.locator("#agentConnectButton").click();
  await expect.poll(() => mock.sockets.length).toBe(2);
  mock.send({ type: "session.ready" });
  await expect(page.locator("#agentStatus")).toHaveText("LISTENING");
  await page.locator("#agentDisconnectButton").click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("late microphone permission after switching provider is disposed", async ({ page }) => {
  const mock = await setup(page);
  await page.evaluate(() => { window.holdMicrophone = true; });
  await page.locator("#agentConnectButton").click();
  await expect.poll(() => page.evaluate(() => Boolean(window.releaseMicrophone))).toBe(true);
  await page.getByRole("tab", { name: /AUDIO FILE/ }).click();
  await page.evaluate(() => window.releaseMicrophone());
  await released(page);
  await expect(page.locator("#statusText")).toHaveText("STANDBY");
  await expect(page.locator("#privacyNotice")).toContainText("LOCAL MODE");
  expect(mock.errors).toEqual([]);
});

test("disconnect releases resources and retry recovers", async ({ page }) => {
  const mock = await setup(page);
  await start(page);
  mock.sockets.at(-1).close({ code: 1011, reason: "network lost" });
  await expect(page.locator("#agentStatus")).toContainText("Connection closed");
  await released(page);
  await expect(page.locator("#agentConnectButton")).toHaveText("RETRY CONNECTION");
  await start(page);
  expect(mock.sockets).toHaveLength(2);
  await page.locator("#agentDisconnectButton").click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("playback stays speaking after response.done and interruption silences it", async ({ page }) => {
  const mock = await setup(page);
  await start(page);
  mock.send({ type: "response.started" });
  mock.send({ type: "output.audio.delta", audio: Buffer.alloc(24000 * 2 * 2).toString("base64") });
  mock.send({ type: "output.transcript.delta", delta: "Hello" });
  mock.send({ type: "response.done" });
  await expect(page.locator("#agentStatus")).toHaveText("SPEAKING");
  await expect(page.locator("#agentTranscript")).toHaveText("Hello");
  await page.locator("#agentInterruptButton").click();
  await expect(page.locator("#agentStatus")).toHaveText("LISTENING");
  await expect.poll(() => mock.messages.some((event) => event.type === "interrupt")).toBe(true);
  mock.send({ type: "output.transcript.delta", delta: " stale" });
  mock.send({ type: "output.audio.delta", audio: Buffer.alloc(48000).toString("base64") });
  await expect(page.locator("#agentTranscript")).toHaveText("Hello");
  await page.getByRole("tab", { name: /MICROPHONE/ }).click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("gateway health failure is actionable and does not open capture", async ({ page }) => {
  const mock = await setup(page, { healthy: false });
  await page.locator("#agentConnectButton").click();
  await expect(page.locator("#agentStatus")).toContainText("Voice service unavailable");
  expect(mock.sockets).toHaveLength(0);
  await released(page);
  await page.route("**/voice-agent/healthz", (route) => route.fulfill({ json: { ok: true } }));
  await start(page);
  await page.locator("#agentDisconnectButton").click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("microphone denial cleans up the connected socket and supports retry", async ({ page }) => {
  const mock = await setup(page);
  await page.evaluate(() => { window.denyMicrophone = true; });
  await page.locator("#agentConnectButton").click();
  await expect(page.locator("#agentStatus")).toContainText("Microphone permission denied");
  await released(page);
  await page.evaluate(() => { window.denyMicrophone = false; });
  await start(page);
  await page.locator("#agentDisconnectButton").click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("local microphone is stopped when switching to a voice conversation", async ({ page }) => {
  const mock = await setup(page);
  await page.getByRole("tab", { name: /MICROPHONE/ }).click();
  await page.locator("#micButton").click();
  await expect(page.locator("#statusText")).toHaveText("MIC LIVE");
  await page.getByRole("tab", { name: /VOICE AGENT/ }).click();
  await released(page);
  await start(page);
  await page.getByRole("tab", { name: /AUDIO FILE/ }).click();
  await page.getByRole("tab", { name: /LOCAL TTS/ }).click();
  await page.getByRole("tab", { name: /MICROPHONE/ }).click();
  await released(page);
  await expect(page.locator("#statusText")).toHaveText("STANDBY");
  await expect(page.getByRole("tab", { name: /MICROPHONE/ })).toHaveAttribute("aria-selected", "true");
  expect(mock.errors).toEqual([]);
});

test("sample audio arriving after a provider switch cannot restart playback", async ({ page }) => {
  const mock = await setup(page);
  let release;
  await page.route("**/audio/sample-voice.wav", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ response });
  });
  await page.getByRole("tab", { name: /AUDIO FILE/ }).click();
  await page.locator("#sampleAudioButton").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("tab", { name: /MICROPHONE/ }).click();
  release();
  await expect(page.locator("#sampleAudioButton")).toBeEnabled();
  await released(page);
  await expect(page.locator("#statusText")).toHaveText("STANDBY");
  await page.getByRole("tab", { name: /AUDIO FILE/ }).click();
  await page.unroute("**/audio/sample-voice.wav");
  await page.locator("#sampleAudioButton").click();
  await expect(page.locator("#statusText")).toHaveText("AUDIO LIVE");
  await page.getByRole("tab", { name: /MICROPHONE/ }).click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("returns to listening only after the playback queue drains naturally", async ({ page }) => {
  const mock = await setup(page);
  await start(page);
  mock.send({ type: "response.started" });
  mock.send({ type: "output.audio.delta", audio: Buffer.alloc(48000).toString("base64") });
  mock.send({ type: "response.done" });
  await expect(page.locator("#agentStatus")).toHaveText("SPEAKING");
  await expect(page.locator("#agentStatus")).toHaveText("LISTENING");
  await page.locator("#agentDisconnectButton").click();
  await released(page);
  expect(mock.errors).toEqual([]);
});

test("switching provider while the gateway health request is pending cancels startup", async ({ page }) => {
  const mock = await setup(page);
  let release;
  await page.route("**/voice-agent/healthz", async (route) => {
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ json: { ok: true } });
  });
  await page.locator("#agentConnectButton").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByRole("tab", { name: /LOCAL TTS/ }).click();
  release();
  await released(page);
  expect(mock.sockets).toHaveLength(0);
  await expect(page.locator("#statusText")).toHaveText("STANDBY");
  expect(mock.errors).toEqual([]);
});

test("ending during avatar loading keeps the avatar visible without starting capture", async ({ page }) => {
  const mock = await setup(page);
  let release;
  await page.route("**/characters/niu-lai/character.json", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => { release = resolve; });
    await route.fulfill({ response });
  });
  await page.locator("#agentConnectButton").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.locator("#agentDisconnectButton").click();
  release();
  await expect(page.locator("#agentStatus")).toHaveText("DISCONNECTED");
  await released(page);
  await expect.poll(() => page.locator("#avatar").evaluate((canvas) => {
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    return data.some((value, index) => index % 4 === 3 && value > 0);
  })).toBe(true);
  expect(await page.evaluate(() => window.testTracks.length)).toBe(0);
  expect(mock.errors).toEqual([]);
});
