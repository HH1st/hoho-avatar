import { createAvatar, CharacterState } from '../../src';
import type { Avatar, RendererFactory } from '../../src';
import { waitFor } from '../../src/internal/abort';

/** Character assets have their own lifetime; changing audio never rebuilds the stage. */
export class CharacterStage {
  avatar?: Avatar;
  private key?: unknown;
  private loading?: AbortController;
  private pending?: Promise<Avatar>;
  private rate = 48_000;
  private state: CharacterState = CharacterState.Idle;

  constructor(private canvas: HTMLCanvasElement, private readonly mounted: (avatar: Avatar) => void,
    private readonly onError: (error: Error) => void) {}

  get isLoading(): boolean { return this.pending !== undefined; }

  async ensure(key: unknown, factory: () => Promise<RendererFactory>, rate: number, state: CharacterState, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    this.rate = rate;
    this.state = state;
    if (this.key !== key || (!this.avatar && !this.pending)) {
      this.disposeCharacter();
      this.key = key;
      const loading = new AbortController();
      this.loading = loading;
      const canvas = this.canvas.cloneNode(false) as HTMLCanvasElement;
      this.canvas.replaceWith(canvas); this.canvas = canvas;
      const operation = (async () => {
        const renderer = await waitFor(factory(), loading.signal);
        const avatar = await createAvatar(canvas, { renderer, sampleRate: rate, signal: loading.signal,
          onError: (error) => { if (this.loading === loading) this.onError(error); } });
        if (this.loading !== loading) { await avatar.destroy(); throw new DOMException('Character replaced', 'AbortError'); }
        this.avatar = avatar;
        avatar.setSampleRate(this.rate);
        avatar.setState(this.state);
        this.mounted(avatar);
        return avatar;
      })();
      this.pending = operation;
      void operation.finally(() => { if (this.pending === operation) this.pending = undefined; }).catch(() => {});
    }
    if (this.pending) await waitFor(this.pending, signal);
    signal?.throwIfAborted();
    if (this.key !== key) return;
    this.avatar?.setSampleRate(this.rate);
    this.avatar?.setState(this.state);
  }

  setState(state: CharacterState): void { this.state = state; this.avatar?.setState(state); }
  resetAudio(): void { this.avatar?.resetAudio(); }
  dispose(): void { this.disposeCharacter(); this.key = undefined; }
  private disposeCharacter(): void {
    this.loading?.abort(); this.loading = undefined; this.pending = undefined;
    const avatar = this.avatar; this.avatar = undefined;
    void avatar?.destroy().catch(this.onError);
  }
}
