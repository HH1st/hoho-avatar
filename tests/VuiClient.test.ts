import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VuiClient } from "../src/voice-agent/VuiClient";
import { base64ToPCM16, pcm16ToBase64, resampleFloat32ToPCM16 } from "../src/voice-agent/pcm";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instance: FakeWebSocket;
  readyState = FakeWebSocket.OPEN;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readonly send = vi.fn();
  readonly close = vi.fn();

  constructor(readonly url: string) { FakeWebSocket.instance = this; }
  emit(event: unknown) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

async function connect(client: VuiClient): Promise<FakeWebSocket> {
  const connected = client.connect();
  const socket = FakeWebSocket.instance;
  socket.emit({ type: "gateway.ready" });
  socket.emit({ type: "session.ready" });
  await connected;
  return socket;
}

describe("VuiClient", () => {
  beforeEach(() => vi.stubGlobal("WebSocket", FakeWebSocket));
  afterEach(() => vi.unstubAllGlobals());

  it("times out an unfinished session handshake and releases the socket for retry", async () => {
    vi.useFakeTimers();
    try {
      const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", connectTimeoutMs: 50 });
      const pending = client.connect();
      const socket = FakeWebSocket.instance;
      socket.emit({ type: "gateway.ready" });
      const rejected = expect(pending).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      expect(socket.close).toHaveBeenCalledOnce();
      await connect(client);
      expect(vi.getTimerCount()).toBe(0);
      client.destroy();
    } finally { vi.useRealTimers(); }
  });

  it("sends session configuration to the backend runtime", async () => {
    const states: string[] = [];
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onStateChange: (state) => states.push(state) });
    const connected = client.connect({ voice: "marin", instructions: "Be concise." });
    FakeWebSocket.instance.emit({ type: "gateway.ready" });
    expect(client.state).toBe("connecting");
    FakeWebSocket.instance.emit({ type: "session.ready" });
    await connected;

    expect(client.state).toBe("connected");
    expect(states).toEqual(["connecting", "connected"]);
    expect(JSON.parse(FakeWebSocket.instance.send.mock.calls[0]?.[0] as string)).toEqual({
      type: "session.configure",
      voice: "marin",
      instructions: "Be concise.",
    });
  });

  it("forwards normalized audio and text input", async () => {
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent" });
    const socket = await connect(client);
    client.sendAudio(new Float32Array(480), 48_000);
    client.sendText(" hello ");

    const events = socket.send.mock.calls.map(([message]) => JSON.parse(message as string));
    expect(events.find((event) => event.type === "input.audio").audio).toBeTypeOf("string");
    expect(events).toContainEqual({ type: "input.text", text: " hello " });
  });

  it("delivers backend output events", async () => {
    const onAudio = vi.fn();
    const onSpeechStart = vi.fn();
    const onOutputInterrupted = vi.fn();
    const client = new VuiClient({
      gatewayUrl: "ws://localhost/voice-agent",
      onAudio,
      onUserSpeechStart: onSpeechStart,
      onOutputInterrupted,
    });
    const socket = await connect(client);
    const pcm = new Int16Array([1, -2, 3]);
    socket.emit({ type: "output.audio.delta", audio: pcm16ToBase64(pcm) });
    socket.emit({ type: "input.speech.started" });
    socket.emit({ type: "output.interrupted" });

    expect(onAudio).toHaveBeenCalledWith(pcm);
    expect(onSpeechStart).toHaveBeenCalledOnce();
    expect(onOutputInterrupted).toHaveBeenCalledOnce();
  });

  it("sends interruption to the backend without local coordination", async () => {
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent" });
    const socket = await connect(client);
    client.interrupt();
    expect(socket.send.mock.calls.map(([message]) => JSON.parse(message as string).type)).toContain("interrupt");
  });

  it("rejects connect when the backend rejects session configuration", async () => {
    const states: string[] = [];
    const onError = vi.fn();
    const client = new VuiClient({
      gatewayUrl: "ws://localhost/voice-agent",
      onError,
      onStateChange: (state) => states.push(state),
    });
    const connected = client.connect();
    FakeWebSocket.instance.emit({ type: "gateway.ready" });
    FakeWebSocket.instance.emit({ type: "error", message: "invalid session" });

    await expect(connected).rejects.toThrow("invalid session");
    expect(client.state).toBe("error");
    expect(states).toEqual(["connecting", "error"]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("settles a cancelled connection and allows immediate reconnect without stale callbacks", async () => {
    const onError = vi.fn();
    const onTranscriptDelta = vi.fn();
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onError, onTranscriptDelta });
    let cancelled: Error | undefined;
    void client.connect().catch((error: Error) => { cancelled = error; });
    const oldSocket = FakeWebSocket.instance;
    const staleMessage = oldSocket.onmessage!;
    const staleClose = oldSocket.onclose!;
    const staleError = oldSocket.onerror!;

    client.disconnect();
    const reconnected = connect(client);
    const newSocket = FakeWebSocket.instance;
    await Promise.resolve();
    expect(cancelled?.name).toBe("AbortError");
    expect(newSocket).not.toBe(oldSocket);
    await reconnected;

    staleMessage({ data: JSON.stringify({ type: "gateway.ready" }) });
    staleMessage({ data: JSON.stringify({ type: "output.transcript.delta", delta: "obsolete" }) });
    staleMessage({ data: JSON.stringify({ type: "error", message: "obsolete" }) });
    staleClose({ code: 1006 });
    staleError();
    expect(client.state).toBe("connected");
    expect(newSocket.send).toHaveBeenCalledOnce();
    expect(onTranscriptDelta).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(oldSocket.close).toHaveBeenCalledOnce();
    client.destroy();
  });

  it("shares the pending handshake and rejects it when the socket closes early", async () => {
    const onError = vi.fn();
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onError });
    const pending = client.connect();
    expect(client.connect()).toBe(pending);
    const socket = FakeWebSocket.instance;
    socket.readyState = FakeWebSocket.CLOSED;
    socket.onclose?.({ code: 1006 });
    await expect(pending).rejects.toThrow("1006");
    expect(onError).toHaveBeenCalledOnce();
    expect(client.state).toBe("error");
    await connect(client);
    client.destroy();
  });

  it("can cancel from the connecting state callback before the transport opens", async () => {
    const client = new VuiClient({
      gatewayUrl: "ws://localhost/voice-agent",
      onStateChange: (state) => {
        if (state === "connecting") {
          FakeWebSocket.instance.readyState = FakeWebSocket.CONNECTING;
          client.disconnect();
        }
      },
    });
    await expect(client.connect()).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWebSocket.instance.close).toHaveBeenCalledOnce();
    expect(client.state).toBe("idle");
  });

  it("returns to idle after remote close and opens a fresh connection", async () => {
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent" });
    const socket = await connect(client);
    socket.readyState = FakeWebSocket.CLOSED;
    socket.onclose?.({ code: 1000 });
    expect(client.state).toBe("idle");
    expect(await connect(client)).not.toBe(socket);
    client.destroy();
  });

  it("settles pending connect on destroy and ignores late session readiness", async () => {
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent" });
    let cancelled: Error | undefined;
    void client.connect().catch((error: Error) => { cancelled = error; });
    const staleMessage = FakeWebSocket.instance.onmessage!;
    client.destroy();
    staleMessage({ data: JSON.stringify({ type: "session.ready" }) });
    await Promise.resolve();
    expect(cancelled?.name).toBe("AbortError");
    expect(client.state).toBe("destroyed");
    expect(() => client.connect()).toThrow("destroyed");
  });

  it("preserves gateway authentication errors and releases the failed socket", async () => {
    const onError = vi.fn();
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onError });
    let failure: Error | undefined;
    void client.connect().catch((error: Error) => { failure = error; });
    const socket = FakeWebSocket.instance;
    socket.emit({ type: "gateway.error", message: "Azure authentication failed" });
    await Promise.resolve();
    expect(failure?.message).toBe("Azure authentication failed");
    expect(client.state).toBe("error");
    expect(onError).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
    await connect(client);
    client.destroy();
  });

  it("releases an established socket on transport failure and permits retry", async () => {
    const onError = vi.fn();
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onError });
    const socket = await connect(client);
    socket.onerror?.();
    expect(client.state).toBe("error");
    expect(onError).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledOnce();
    await connect(client);
    client.destroy();
  });

  it("ignores malformed messages and audio without breaking later output", async () => {
    const onAudio = vi.fn();
    const onTranscriptDelta = vi.fn();
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onAudio, onTranscriptDelta });
    const socket = await connect(client);
    for (const event of [null, [], 7, "text", {}, { type: 1 },
      { type: "output.transcript.delta", delta: 42 },
      { type: "output.audio.delta", audio: {} },
      { type: "output.audio.delta", audio: "not base64!" },
      { type: "output.audio.delta", audio: "AA==" }]) {
      expect(() => socket.emit(event)).not.toThrow();
    }
    socket.onmessage?.({ data: "{" });
    const pcm = new Int16Array([1, -2]);
    socket.emit({ type: "output.audio.delta", audio: pcm16ToBase64(pcm) });
    socket.emit({ type: "output.transcript.delta", delta: "valid" });
    expect(client.state).toBe("connected");
    expect(onAudio).toHaveBeenCalledExactlyOnceWith(pcm);
    expect(onTranscriptDelta).toHaveBeenCalledExactlyOnceWith("valid");
    client.destroy();
  });

  it("reports a WebSocket constructor failure and allows retry", async () => {
    const onError = vi.fn();
    const client = new VuiClient({ gatewayUrl: "ws://localhost/voice-agent", onError });
    vi.stubGlobal("WebSocket", class { constructor() { throw new Error("Invalid WebSocket URL"); } });
    await expect(client.connect()).rejects.toThrow("Invalid WebSocket URL");
    expect(client.state).toBe("error");
    expect(onError).toHaveBeenCalledOnce();
    vi.stubGlobal("WebSocket", FakeWebSocket);
    await connect(client);
    client.destroy();
  });
});

describe("Realtime PCM conversion", () => {
  it("round-trips PCM16 through base64", () => {
    const pcm = new Int16Array([-32_768, 0, 32_767]);
    expect(base64ToPCM16(pcm16ToBase64(pcm))).toEqual(pcm);
  });

  it("resamples browser PCM to 24 kHz", () => {
    expect(resampleFloat32ToPCM16(new Float32Array(480), 48_000)).toHaveLength(240);
  });
});
