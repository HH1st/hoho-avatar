declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;
declare const sampleRate: number;

class AudioClipProcessor extends AudioWorkletProcessor {
  private readonly batch = new Float32Array(Math.max(128, Math.round(sampleRate * 0.02)));
  private batchLength = 0;

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    const frameCount = input?.[0]?.length ?? 0;

    if (!input?.length || !output || frameCount === 0) return true;

    for (let channel = 0; channel < output.length; channel += 1) {
      output[channel]?.set(input[channel] ?? input[0]!);
    }

    for (let index = 0; index < frameCount; index += 1) {
      let mono = 0;
      for (const channel of input) mono += (channel[index] ?? 0) / input.length;
      this.batch[this.batchLength] = mono;
      this.batchLength += 1;
      if (this.batchLength === this.batch.length) {
        const completed = this.batch.slice();
        this.port.postMessage(completed, [completed.buffer]);
        this.batchLength = 0;
      }
    }
    return true;
  }
}

registerProcessor("audio-clip-processor", AudioClipProcessor);
