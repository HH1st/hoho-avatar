/** Convert browser Float32 PCM to 24 kHz signed 16-bit PCM for Realtime. */
export function resampleFloat32ToPCM16(input: Float32Array, inputRate: number, outputRate = 24_000): Int16Array {
  if (inputRate <= 0 || outputRate <= 0) throw new Error("PCM sample rates must be positive");
  if (input.length === 0) return new Int16Array();
  const outputLength = Math.max(1, Math.round((input.length * outputRate) / inputRate));
  const output = new Int16Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(input.length - 1, Math.floor(position));
    const right = Math.min(input.length - 1, left + 1);
    const fraction = position - left;
    const sample = (input[left] ?? 0) * (1 - fraction) + (input[right] ?? 0) * fraction;
    const clamped = Math.max(-1, Math.min(1, sample));
    output[index] = clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767);
  }
  return output;
}

export function pcm16ToBase64(input: Int16Array): string {
  const bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function base64ToPCM16(input: string): Int16Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Int16Array(bytes.buffer);
}

export function pcm16ToFloat32(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) output[index] = (input[index] ?? 0) / 32_768;
  return output;
}

