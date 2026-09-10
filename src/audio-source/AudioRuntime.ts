import processorUrl from './audio-clip-processor.ts?worker&url';
import { abortError, waitFor } from '../internal/abort';

/** Shared ownership of an AudioContext, module loading and cancellable waits. */
export class AudioRuntime {
  readonly context = new AudioContext();
  private readonly lifetime = new AbortController();
  private moduleReady?: Promise<void>;
  private closing?: Promise<void>;

  get signal(): AbortSignal { return this.lifetime.signal; }

  loadWorklet(): Promise<void> {
    this.signal.throwIfAborted();
    return this.moduleReady ??= this.context.audioWorklet.addModule(processorUrl);
  }

  async prepare(): Promise<void> {
    this.signal.throwIfAborted();
    // resume must run before the first await, inside the user gesture.
    await this.wait(Promise.all([this.context.resume(), this.loadWorklet()]));
  }

  wait<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    return waitFor(operation, signal ? AbortSignal.any([this.signal, signal]) : this.signal);
  }

  destroy(): Promise<void> {
    if (this.closing) return this.closing;
    this.lifetime.abort(abortError());
    this.closing = this.context.close();
    return this.closing;
  }
}
