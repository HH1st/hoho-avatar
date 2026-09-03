import type { AudioClipMetadata } from "./AudioClipPlayer";
import { AudioQueuePlayer } from "./AudioQueuePlayer";

export interface TTSSynthesisOptions {
  voice?: string;
  speed?: number;
  onProgress?: (stage: string) => void;
}

export type TTSSynthesizer = (text: string, options: TTSSynthesisOptions) => Promise<Blob>;

export interface StreamingTTSPlayerOptions extends TTSSynthesisOptions {
  synthesize: TTSSynthesizer;
  onPCM: (chunk: Float32Array) => void;
  onPlaybackStart?: (metadata: AudioClipMetadata) => void | Promise<void>;
  onEnded?: () => void;
  onError?: (error: unknown) => void;
  onStateChange?: (state: StreamingTTSPlayerState) => void;
  maxChunkCharacters?: number;
  minChunkCharacters?: number;
  /** Number of synthesized phrases to queue before playback. Default: 1. */
  prebufferChunks?: number;
}

export interface TTSChunkResult {
  chunks: string[];
  remainder: string;
}

export type StreamingTTSPlayerState = "idle" | "synthesizing" | "playing" | "stopping" | "error" | "destroyed";

/**
 * Pulls speakable phrases out of incremental text while keeping an unfinished
 * tail for the next write. Sentence punctuation is preferred; long tails are
 * split on whitespace so a streaming response cannot grow without bound.
 */
export function takeTTSChunks(
  text: string,
  options: { flush?: boolean; maxCharacters?: number; minCharacters?: number } = {},
): TTSChunkResult {
  const maxCharacters = Math.max(20, options.maxCharacters ?? 120);
  const minCharacters = Math.min(maxCharacters, Math.max(1, options.minCharacters ?? 32));
  let remainder = text.replace(/\s+/g, " ").trimStart();
  const chunks: string[] = [];

  while (remainder.length > 0) {
    let cut = -1;
    const boundary = /[.!?;:\n](?:["')\]]+)?\s+|[,](?:\s+)/g;
    for (const match of remainder.matchAll(boundary)) {
      const end = (match.index ?? 0) + match[0].length;
      if (end >= minCharacters) {
        cut = end;
        break;
      }
    }

    if (cut < 0 && remainder.length > maxCharacters) {
      const candidate = remainder.slice(0, maxCharacters + 1);
      const whitespace = candidate.lastIndexOf(" ");
      cut = whitespace >= minCharacters ? whitespace + 1 : maxCharacters;
    }

    if (cut < 0) break;
    const chunk = remainder.slice(0, cut).trim();
    if (chunk) chunks.push(chunk);
    remainder = remainder.slice(cut).trimStart();
  }

  if (options.flush && remainder.trim()) {
    chunks.push(remainder.trim());
    remainder = "";
  }

  return { chunks, remainder };
}

/**
 * Turns incremental text into short synthesized clips. Synthesis continues
 * ahead of playback, while decoded clips are appended to one Web Audio
 * timeline so the same continuous PCM path can drive an avatar.
 */
export class StreamingTTSPlayer {
  private readonly audioPlayer: AudioQueuePlayer;
  private readonly textQueue: string[] = [];
  private readonly audioQueue: Blob[] = [];
  private textBuffer = "";
  private generation = 0;
  private synthesizing = false;
  private playing = false;
  private playbackStarted = false;
  private endRequested = false;
  private currentState: StreamingTTSPlayerState = "idle";

  constructor(private readonly options: StreamingTTSPlayerOptions) {
    this.audioPlayer = new AudioQueuePlayer({
      onPCM: options.onPCM,
      onPlaybackStart: async (metadata) => {
        this.playing = true;
        this.setState("playing");
        await options.onPlaybackStart?.(metadata);
      },
      onEnded: () => {
        this.playing = false;
        this.playbackStarted = false;
        this.setState("idle");
        options.onEnded?.();
      },
    });
  }

  get state(): StreamingTTSPlayerState {
    return this.currentState;
  }

  /** Unlock Web Audio from the same user gesture that starts TTS. */
  async prepare(): Promise<void> {
    this.assertActive();
    await this.audioPlayer.prepare();
  }

  write(delta: string): void {
    this.assertActive();
    this.assertAcceptingText();
    if (!delta) return;
    this.endRequested = false;
    this.textBuffer += delta;
    this.extractChunks(false);
    this.startSynthesis();
  }

  flush(): void {
    this.assertActive();
    this.assertAcceptingText();
    this.endRequested = true;
    this.extractChunks(true);
    this.startSynthesis();
    this.finishIfDrained();
  }

  speak(text: string): void {
    this.assertActive();
    this.assertAcceptingText();
    this.stop();
    const utterance = text.replace(/\s+/g, " ").trim();
    if (!utterance) return;
    this.textBuffer = utterance;
    this.endRequested = true;
    this.extractChunks(true);
    this.startSynthesis();
  }

  /** Generate one complete utterance before playback to guarantee no gaps. */
  speakComplete(text: string): void {
    this.assertActive();
    this.assertAcceptingText();
    this.stop();
    const utterance = text.replace(/\s+/g, " ").trim();
    if (!utterance) return;
    this.endRequested = true;
    this.textQueue.push(utterance);
    this.startSynthesis();
  }

  stop(): void {
    this.assertActive();
    if (this.currentState === "stopping") return;
    const synthesisStillRunning = this.synthesizing;
    ++this.generation;
    this.textBuffer = "";
    this.textQueue.length = 0;
    this.audioQueue.length = 0;
    this.playing = false;
    this.playbackStarted = false;
    this.endRequested = false;
    if (this.audioPlayer.active) this.audioPlayer.stop();
    this.setState(synthesisStillRunning ? "stopping" : "idle");
  }

  async destroy(): Promise<void> {
    if (this.currentState === "destroyed") return;
    ++this.generation;
    this.textQueue.length = 0;
    this.audioQueue.length = 0;
    this.setState("destroyed");
    await this.audioPlayer.destroy();
  }

  private extractChunks(flush: boolean): void {
    const result = takeTTSChunks(this.textBuffer, {
      flush,
      maxCharacters: this.options.maxChunkCharacters,
      minCharacters: this.options.minChunkCharacters,
    });
    this.textBuffer = result.remainder;
    this.textQueue.push(...result.chunks);
  }

  private startSynthesis(): void {
    if (this.synthesizing || this.textQueue.length === 0) return;
    const generation = this.generation;
    this.synthesizing = true;
    if (!this.playbackStarted) this.setState("synthesizing");
    void this.synthesizeQueued(generation);
  }

  private async synthesizeQueued(generation: number): Promise<void> {
    try {
      while (generation === this.generation && this.textQueue.length > 0) {
        const text = this.textQueue.shift()!;
        const audio = await this.options.synthesize(text, {
          voice: this.options.voice,
          speed: this.options.speed,
          onProgress: this.options.onProgress,
        });
        if (generation !== this.generation) return;
        this.audioQueue.push(audio);
        await this.appendReadyAudio(generation, false);
      }
    } catch (error) {
      if (generation !== this.generation) return;
      this.currentState = "error";
      this.textQueue.length = 0;
      this.audioQueue.length = 0;
      this.endRequested = false;
      if (this.audioPlayer.active) this.audioPlayer.stop();
      this.playing = false;
      this.options.onError?.(error);
    } finally {
      if (generation !== this.generation) {
        this.synthesizing = false;
        if (this.currentState === "stopping") this.setState("idle");
      } else {
        if (this.currentState === "error") {
          this.synthesizing = false;
          return;
        }
        try {
          await this.appendReadyAudio(generation, true);
        } catch (error) {
          if (generation === this.generation) this.fail(error);
          this.synthesizing = false;
          return;
        }
        if (generation !== this.generation) return;
        this.synthesizing = false;

        // Text can arrive while the final decoded clips are being appended.
        // Re-enter the worker so those deltas cannot be stranded in the queue.
        if (this.textQueue.length > 0) {
          this.startSynthesis();
        } else if (this.endRequested) {
          this.audioPlayer.finish();
        }
      }
    }
  }

  private async appendReadyAudio(generation: number, force: boolean): Promise<void> {
    const prebufferChunks = Math.max(1, this.options.prebufferChunks ?? 1);
    if (!this.playbackStarted && !force && this.audioQueue.length < prebufferChunks) return;
    this.playbackStarted = true;
    while (generation === this.generation && this.audioQueue.length > 0) {
      await this.audioPlayer.append(this.audioQueue.shift()!);
    }
  }

  private finishIfDrained(): void {
    if (!this.endRequested || this.synthesizing || this.playing || this.playbackStarted || this.textQueue.length || this.audioQueue.length) return;
    this.endRequested = false;
    this.setState("idle");
    this.options.onEnded?.();
  }

  private fail(error: unknown): void {
    this.setState("error");
    this.endRequested = false;
    this.playing = false;
    this.playbackStarted = false;
    this.audioQueue.length = 0;
    if (this.audioPlayer.active) this.audioPlayer.stop();
    this.options.onError?.(error);
  }

  private assertActive(): void {
    if (this.currentState === "destroyed") throw new Error("StreamingTTSPlayer has been destroyed");
  }

  private assertAcceptingText(): void {
    if (this.currentState === "stopping") {
      throw new Error("TTS is still stopping the previous synthesis");
    }
  }

  private setState(state: StreamingTTSPlayerState): void {
    if (this.currentState === state) return;
    this.currentState = state;
    this.options.onStateChange?.(state);
  }
}
