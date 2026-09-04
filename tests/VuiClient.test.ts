import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VuiClient } from "../src/voice-agent/VuiClient";
import { base64ToPCM16, pcm16ToBase64, resampleFloat32ToPCM16 } from "../src/voice-agent/pcm";

class FakeWebSocket {
  static readonly OPEN = 1;
  static instance: FakeWebSocket;
  readyState = FakeWebSocket.OPEN;
  onerror: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  readonly send = vi.fn();
  readonly close = vi.fn();

  constructor(readonly url: string) { FakeWebSocket.instance = this; }
  emit(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
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
