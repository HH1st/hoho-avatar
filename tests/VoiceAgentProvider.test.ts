import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AzureVoiceAgentProvider } from "../src/voice-agent/AzureVoiceAgentProvider";
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

describe("AzureVoiceAgentProvider", () => {
  beforeEach(() => vi.stubGlobal("WebSocket", FakeWebSocket));
  afterEach(() => vi.unstubAllGlobals());

  it("configures the session after the gateway authenticates", async () => {
    const states: string[] = [];
    const provider = new AzureVoiceAgentProvider({ gatewayUrl: "ws://localhost/voice-agent", onStateChange: (state) => states.push(state) });
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
    const provider = new AzureVoiceAgentProvider({ gatewayUrl: "ws://localhost/voice-agent" });
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
    const provider = new AzureVoiceAgentProvider({
      gatewayUrl: "ws://localhost/voice-agent",
      onAudio,
      onUserSpeechStart: onSpeechStart,
    });
    const connected = provider.connect();
    FakeWebSocket.instance.emit({ type: "gateway.ready" });
    FakeWebSocket.instance.emit({ type: "session.updated" });
    await connected;
    const pcm = new Int16Array([1, -2, 3]);
    FakeWebSocket.instance.emit({ type: "response.output_audio.delta", delta: pcm16ToBase64(pcm) });
    FakeWebSocket.instance.emit({ type: "input_audio_buffer.speech_started" });

    expect(onAudio.mock.calls[0]?.[0]).toEqual(pcm);
    expect(onSpeechStart).toHaveBeenCalledOnce();
  });

  it("rejects connect when Azure rejects the session configuration", async () => {
    const states: string[] = [];
    const onError = vi.fn();
    const provider = new AzureVoiceAgentProvider({
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
    expect(onError).toHaveBeenCalledOnce();
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
