import { MicrophoneInput, StreamingPCMPlayer, VuiClient } from "../../src";
import type { VuiSessionOptions } from "../../src";

export type VoiceSessionState = "disconnected" | "connecting" | "listening" | "thinking" | "speaking" | "stopping" | "error";

interface VoiceSessionOptions {
  gatewayUrl: string;
  healthUrl?: string;
  onState: (state: VoiceSessionState, error?: Error) => void;
  onPCM: (chunk: Float32Array) => void;
  onReset: () => void;
  onTranscript: (text: string) => void;
  onReady: (sampleRate: number, signal: AbortSignal) => Promise<void>;
}

interface SessionRun {
  abort: AbortController;
  client?: VuiClient;
  player?: StreamingPCMPlayer;
  microphone?: MicrophoneInput;
  transcript: string;
  responding: boolean;
  interrupted: boolean;
  cleanup?: Promise<void>;
}

/** One owner for the socket, capture and playback. Stale runs never update the UI. */
export class VoiceSession {
  private run?: SessionRun;
  private currentState: VoiceSessionState = "disconnected";
  private starting?: Promise<void>;

  constructor(private readonly options: VoiceSessionOptions) {}

  get state(): VoiceSessionState { return this.currentState; }
  get sampleRate(): number | undefined { return this.run?.player?.outputSampleRate; }

  start(session: VuiSessionOptions = {}): Promise<void> {
    if (this.starting) return this.starting;
    if (this.run) return Promise.resolve();
    const run: SessionRun = { abort: new AbortController(), transcript: "", responding: false, interrupted: false };
    this.run = run;
    this.setState("connecting");
    this.options.onTranscript("Start a conversation, then speak naturally.");
    const operation = this.connect(run, session);
    const tracked = operation.finally(() => { if (this.starting === tracked) this.starting = undefined; });
    this.starting = tracked;
    return tracked;
  }

  private async connect(run: SessionRun, session: VuiSessionOptions): Promise<void> {
    const current = () => this.run === run && !run.abort.signal.aborted;
    const update = (state: VoiceSessionState) => { if (current()) this.setState(state); };
    const fail = (error: Error) => { if (current()) void this.end(run, error); };
    try {
      run.player = new StreamingPCMPlayer({
        sampleRate: 24_000,
        onPCM: (chunk) => { if (current()) this.options.onPCM(chunk); },
        onPlaybackEnd: () => {
          if (!current()) return;
          this.options.onReset();
          update(run.responding ? "thinking" : "listening");
        },
      });
      run.microphone = new MicrophoneInput((chunk, rate) => { if (current()) run.client?.sendAudio(chunk, rate); });
      // Unlock both AudioContexts in the start-button gesture.
      await Promise.all([run.player.prepare(), run.microphone.prepare(), this.checkHealth(run.abort.signal)]);
      if (!current()) return;
      run.client = new VuiClient({
        gatewayUrl: this.options.gatewayUrl,
        onAudio: (pcm) => {
          if (!current() || run.interrupted) return;
          try { run.player!.appendPCM16(pcm); update("speaking"); } catch (error) { fail(asError(error)); }
        },
        onTranscriptDelta: (delta) => {
          if (!current() || run.interrupted) return;
          run.transcript += delta;
          this.options.onTranscript(run.transcript);
        },
        onResponseStart: () => {
          if (!current()) return;
          run.responding = true;
          run.interrupted = false;
          run.transcript = "";
          this.options.onTranscript("…");
          update("thinking");
        },
        onResponseEnd: () => {
          if (!current()) return;
          run.responding = false;
          if (!run.player!.active) update("listening");
        },
        onUserSpeechStart: () => { if (current()) { this.silence(run); update("listening"); } },
        onUserSpeechEnd: () => update("thinking"),
        onOutputInterrupted: () => { if (current()) { this.silence(run); update("listening"); } },
        onStateChange: (state) => { if (state === "idle") fail(new Error("Connection closed. Start again to reconnect.")); },
        onError: fail,
      });
      await run.client.connect(session);
      if (!current()) return;
      await this.options.onReady(run.player.outputSampleRate, run.abort.signal);
      if (!current()) return;
      await run.microphone.start(run.abort.signal);
      update("listening");
    } catch (error) {
      if (current()) await this.end(run, asError(error));
    }
  }

  interrupt(): void {
    const run = this.run;
    if (!run || run.client?.state !== "connected") return;
    this.silence(run);
    run.client.interrupt();
    this.setState("listening");
  }

  stop(): Promise<void> {
    if (this.run) return this.end(this.run);
    this.setState("disconnected");
    return Promise.resolve();
  }

  private silence(run: SessionRun): void {
    run.interrupted = true;
    run.responding = false;
    run.player?.interrupt();
    this.options.onReset();
  }

  private end(run: SessionRun, error?: Error): Promise<void> {
    if (run.cleanup) return run.cleanup;
    // Abort before disconnect() dispatches its state notification. Keep the run
    // owned until cleanup finishes so repeated END/start cannot overlap teardown.
    run.abort.abort();
    if (this.run === run) {
      this.starting = undefined;
      this.setState("stopping");
    }
    run.client?.destroy();
    run.player?.interrupt();
    this.options.onReset();
    run.cleanup = Promise.allSettled([run.microphone?.destroy(), run.player?.destroy()]).then(() => {
      if (this.run !== run) return;
      this.run = undefined;
      this.setState(error ? "error" : "disconnected", error);
    });
    return run.cleanup;
  }

  private async checkHealth(signal: AbortSignal): Promise<void> {
    if (!this.options.healthUrl) return;
    try {
      const response = await fetch(this.options.healthUrl, { signal: AbortSignal.any([signal, AbortSignal.timeout(3000)]) });
      if (!response.ok || (await response.json()).ok !== true) throw new Error("Unavailable");
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("Voice service unavailable. Please retry once the service is running.");
    }
  }

  private setState(state: VoiceSessionState, error?: Error): void {
    this.currentState = state;
    this.options.onState(state, error);
  }
}

function asError(error: unknown): Error { return error instanceof Error ? error : new Error("Voice session failed"); }
