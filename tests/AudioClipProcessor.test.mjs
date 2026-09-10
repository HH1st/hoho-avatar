import { afterEach, describe, expect, it, vi } from 'vitest';

async function processorAt(rate) {
  let Processor;
  vi.resetModules();
  vi.stubGlobal('sampleRate', rate);
  vi.stubGlobal('AudioWorkletProcessor', class { port = { postMessage: vi.fn(), onmessage: null }; });
  vi.stubGlobal('registerProcessor', (_name, constructor) => { Processor = constructor; });
  await import('../src/audio-source/audio-clip-processor.ts');
  return new Processor();
}

describe('20 ms worklet capture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([44_100, 48_000])("preserves every sample across render quanta at %i Hz", async (rate) => {
    const processor = await processorAt(rate);
    const length = Math.round(rate * 0.02);
    // Use changing quantum sizes and span several packet boundaries.
    const samples = Float32Array.from({ length: length * 5 }, (_, index) => index / (length * 5));
    let offset = 0;
    for (let quantum = 0; offset < samples.length; quantum++) {
      const chunk = samples.slice(offset, offset + [128, 256, 64][quantum % 3]);
      const output = new Float32Array(chunk.length);
      expect(processor.process([[chunk]], [[output]])).toBe(true);
      offset += chunk.length;
    }
    const messages = processor.port.postMessage.mock.calls;
    expect(messages).toHaveLength(5);
    messages.forEach(([chunk, transfer], index) => {
      expect(chunk).toHaveLength(length);
      expect(chunk).toEqual(samples.slice(index * length, (index + 1) * length));
      expect(transfer).toEqual([chunk.buffer]);
    });
  });

  it('mixes channels to mono and discards a partial packet on reset', async () => {
    const processor = await processorAt(48_000);
    processor.process([[new Float32Array(128).fill(1)]], [[new Float32Array(128)]]);
    processor.port.onmessage({ data: { type: 'reset' } });
    processor.process([], [[new Float32Array(128)]]);
    expect(processor.port.postMessage).not.toHaveBeenCalled();
    processor.process([[new Float32Array(960).fill(0.75), new Float32Array(960).fill(-0.25)]], [[new Float32Array(960)]]);
    expect(processor.port.postMessage).toHaveBeenCalledOnce();
    expect(processor.port.postMessage.mock.calls[0][0]).toEqual(new Float32Array(960).fill(0.25));
  });
});
