import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VuiRuntime } from "../src/voice-agent/vui";
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

async function connect(provider: VuiRuntime): Promise<FakeWebSocket> {
  const connected = provider.connect();
  const socket = FakeWebSocket.instance;
  socket.emit({ type: "gateway.ready" });
  socket.emit({ type: "session.updated" });
  await connected;
  return socket;
}

describe("VuiRuntime", () => {
  beforeEach(() => vi.stubGlobal("WebSocket", FakeWebSocket));
  afterEach(() => vi.unstubAllGlobals());

  it("configures the session after the gateway authenticates", async () => {
    const states: string[] = [];
    const provider = new VuiRuntime({ gatewayUrl: "ws://localhost/voice-agent", onStateChange: (state) => states.push(state) });
    const connected = provider.connect({ voice: "marin", instructions: "Be concise." });
    FakeWebSocket.instance.emit({ type: "gateway.ready" });
    expect(provider.state).toBe("connecting");
    FakeWebSocket.instance.emit({ type: "session.updated" });
    await connected;

    expect(provider.state).toBe("connected");
    expect(states).toEqual(["connecting", "connected"]);
    const update = JSON.parse(FakeWebSocket.instance.send.mock.calls[0]?.[0] as string);
    expect(update.session.audio.input.format).toEqual({ type: "audio/pcm", rate: 24_000 });
    expect(update.session.audio.input.turn_detection.interrupt_response).toBe(true);
    expect(update.session.audio.output.voice).toBe("marin");
  });

  it("uses cedar as the default voice", async () => {
    const provider = new VuiRuntime({ gatewayUrl: "ws://localhost/voice-agent" });
    const connected = provider.connect();
    FakeWebSocket.instance.emit({ type: "gateway.ready" });
    FakeWebSocket.instance.emit({ type: "session.updated" });
    await connected;

    const update = JSON.parse(FakeWebSocket.instance.send.mock.calls[0]?.[0] as string);
    expect(update.session.audio.output.voice).toBe("cedar");
  });

  it("routes output audio and speech lifecycle events", async () => {
    const onAudio = vi.fn();
    const onSpeechStart = vi.fn();
    const provider = new VuiRuntime({
      gatewayUrl: "ws://localhost/voice-agent",
      onAudio,
      onUserSpeechStart: onSpeechStart,
    });
    const socket = await connect(provider);
    const pcm = new Int16Array([1, -2, 3]);
    socket.emit({ type: "response.created", response: { id: "response-1" } });
    socket.emit({ type: "response.output_audio.delta", response_id: "response-1", delta: pcm16ToBase64(pcm) });
    await vi.waitFor(() => expect(onAudio).toHaveBeenCalledOnce());
    socket.emit({ type: "input_audio_buffer.speech_started" });

    expect(onAudio.mock.calls[0]?.[0]).toEqual(pcm);
    await vi.waitFor(() => expect(onSpeechStart).toHaveBeenCalledOnce());
  });

  it("drops stale output after interruption", async () => {
    const onAudio = vi.fn();
    const onOutputInterrupted = vi.fn();
    const onUserSpeechEnd = vi.fn();
    const provider = new VuiRuntime({
      gatewayUrl: "ws://localhost/voice-agent",
      onAudio,
      onOutputInterrupted,
      onUserSpeechEnd,
    });
    const socket = await connect(provider);
    socket.emit({ type: "response.created", response: { id: "response-1" } });
    await vi.waitFor(() => expect(provider.state).toBe("connected"));

    provider.interrupt();
    await vi.waitFor(() => expect(onOutputInterrupted).toHaveBeenCalledOnce());
    socket.emit({
      type: "response.output_audio.delta",
      response_id: "response-1",
      delta: pcm16ToBase64(new Int16Array([7, 8, 9])),
    });
    socket.emit({ type: "input_audio_buffer.speech_stopped" });
    await vi.waitFor(() => expect(onUserSpeechEnd).toHaveBeenCalledOnce());

    expect(onAudio).not.toHaveBeenCalled();
    expect(socket.send.mock.calls.map(([message]) => JSON.parse(message as string).type)).toContain("response.cancel");
  });

  it("accepts text input through the process loop", async () => {
    const provider = new VuiRuntime({ gatewayUrl: "ws://localhost/voice-agent" });
    const socket = await connect(provider);
    provider.sendText(" hello ");

    await vi.waitFor(() => {
      const events = socket.send.mock.calls.map(([message]) => JSON.parse(message as string));
      expect(events.some((event) => event.type === "conversation.item.create" && event.item.content[0].text === "hello")).toBe(true);
      expect(events.some((event) => event.type === "response.create")).toBe(true);
    });
  });

  it("rejects connect when Azure rejects the session configuration", async () => {
    const states: string[] = [];
    const onError = vi.fn();
    const provider = new VuiRuntime({
      gatewayUrl: "ws://localhost/voice-agent",
      onError,
      onStateChange: (state) => states.push(state),
    });
    const connected = provider.connect();
    FakeWebSocket.instance.emit({ type: "gateway.ready" });
    FakeWebSocket.instance.emit({ type: "error", error: { message: "invalid session" } });

    await expect(connected).rejects.toThrow("invalid session");
    expect(provider.state).toBe("error");
    expect(states).toEqual(["connecting", "error"]);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
  });
});

describe("Realtime PCM conversion", () => {
  it("round-trips PCM16 through base64", () => {
    const pcm = new Int16Array([-32_768, 0, 32_767]);
    expect(base64ToPCM16(pcm16ToBase64(pcm))).toEqual(pcm);
  });

  it("resamples browser PCM to 24 kHz", () => {
    const output = resampleFloat32ToPCM16(new Float32Array(480), 48_000);
    expect(output).toHaveLength(240);
  });
});
