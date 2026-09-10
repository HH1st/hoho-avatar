import { afterEach, expect, it, vi } from 'vitest';
import { AudioRuntime } from '../src/audio-source/AudioRuntime';
import { AudioQueuePlayer } from '../src/audio-source/AudioQueuePlayer';
import { StreamingPCMPlayer } from '../src/voice-agent/StreamingPCMPlayer';

afterEach(() => vi.unstubAllGlobals());
function context() {
  const addModule = vi.fn().mockImplementation(() => new Promise<void>(() => {}));
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('AudioContext', class {
    audioWorklet = { addModule }; close = close; resume = vi.fn().mockResolvedValue(undefined);
  });
  return { close, addModule };
}
it('shares module loading across concurrent preparations and aborts all waiters on destruction', async () => {
  const { close, addModule } = context();
  const runtime = new AudioRuntime();
  const a = expect(runtime.prepare()).rejects.toMatchObject({ name: 'AbortError' });
  const b = expect(runtime.prepare()).rejects.toMatchObject({ name: 'AbortError' });
  await runtime.destroy(); await Promise.all([a, b]);
  expect(addModule).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
  await runtime.destroy(); expect(close).toHaveBeenCalledOnce();
});
it.each(['queue', 'pcm'])('cancels %s preparation with the same semantics', async (kind) => {
  const { close } = context();
  const player = kind === 'queue' ? new AudioQueuePlayer({ onPCM: vi.fn() }) : new StreamingPCMPlayer();
  const rejected = expect(player.prepare()).rejects.toMatchObject({ name: 'AbortError' });
  await player.destroy(); await rejected;
  expect(close).toHaveBeenCalledOnce();
});
