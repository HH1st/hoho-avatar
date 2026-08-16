declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

class AudioClipProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    const frameCount = input?.[0]?.length ?? 0;

    if (!input?.length || !output || frameCount === 0) return true;

    for (let channel = 0; channel < output.length; channel += 1) {
      output[channel]?.set(input[channel] ?? input[0]!);
    }

    const mono = new Float32Array(frameCount);
    for (const channel of input) {
      for (let index = 0; index < frameCount; index += 1) {
        mono[index] = (mono[index] ?? 0) + (channel[index] ?? 0) / input.length;
      }
    }

    this.port.postMessage(mono, [mono.buffer]);
    return true;
  }
}

registerProcessor("audio-clip-processor", AudioClipProcessor);