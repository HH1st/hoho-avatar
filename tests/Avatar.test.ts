import { afterEach, describe, expect, it, vi } from 'vitest';
import { Avatar, createAvatar } from '../src/core/Avatar';
import type { TalkingSprite } from '../src/core/TalkingSprite';

function setup() {
  const contexts: any[] = [];
  const worklets: any[] = [];
  const tracks: any[] = [];
  const decode = vi.fn().mockResolvedValue({ sampleRate: 44100, duration: 1, numberOfChannels: 1 });
  const capture = vi.fn().mockImplementation(async () => {
    const track = { stop: vi.fn() }; tracks.push(track);
    return { getTracks: () => [track] };
  });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  vi.stubGlobal('AudioContext', class {
    sampleRate = 44100;
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    decodeAudioData = decode;
    sources: any[] = [];
    constructor() { contexts.push(this); }
    createBufferSource() { const source = { ...node(), start: vi.fn(), stop: vi.fn(), onended: null }; this.sources.push(source); return source; }
    createMediaStreamSource() { return node(); }
    createGain() { return { ...node(), gain: { value: 1 } }; }
  });
  vi.stubGlobal('AudioWorkletNode', class {
    port = { onmessage: null, close: vi.fn() };
    connect = vi.fn(); disconnect = vi.fn();
    constructor() { worklets.push(this); }
  });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: capture } });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const sprite = { resetAudio: vi.fn(), setSampleRate: vi.fn(), pushPCM: vi.fn(), destroy: vi.fn() };
  return { sprite, avatar: new Avatar(sprite as unknown as TalkingSprite), contexts, worklets, tracks, decode, capture };
}

describe('Avatar SDK', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cancels delayed file decoding when switching to microphone capture', async () => {
    const { avatar, sprite, decode, contexts, worklets, tracks } = setup();
    let release!: (metadata: object) => void;
    decode.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    const first = avatar.playAudio(new ArrayBuffer(1));
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    await avatar.startMicrophone();
    release({ sampleRate: 48000, duration: 1, numberOfChannels: 1 });
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(contexts[0].sources).toHaveLength(0);
    expect(contexts[0].close).toHaveBeenCalledOnce();
    worklets[0].port.onmessage({ data: new Float32Array([0.5]) });
    expect(sprite.setSampleRate).toHaveBeenCalledWith(44100);
    expect(sprite.pushPCM).toHaveBeenCalledOnce();
    await avatar.destroy();
    expect(tracks[0].stop).toHaveBeenCalledOnce();
  });

  it('uses decoded sample rate and ignores old worklet messages after playback ends', async () => {
    const { avatar, sprite, contexts, worklets } = setup();
    await avatar.playAudio(new ArrayBuffer(1));
    expect(sprite.setSampleRate).toHaveBeenCalledWith(44100);
    const oldPCM = worklets[0].port.onmessage;
    oldPCM({ data: new Float32Array([1]) });
    expect(sprite.pushPCM).toHaveBeenCalledOnce();
    contexts[0].sources[0].onended();
    expect(contexts[0].close).toHaveBeenCalledOnce();
    oldPCM({ data: new Float32Array([1]) });
    expect(sprite.pushPCM).toHaveBeenCalledOnce();
    avatar.pushPCM(new Int16Array([1]), 24000);
    expect(sprite.setSampleRate).toHaveBeenLastCalledWith(24000);
    await avatar.destroy();
  });

  it('aborts URL fetch on stop and can subsequently play another clip', async () => {
    const { avatar } = setup();
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      signal = options.signal;
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason)));
    }));
    const playing = avatar.playAudio('/slow.wav');
    await vi.waitFor(() => expect(signal).toBeDefined());
    avatar.stopAudio();
    await expect(playing).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal!.aborted).toBe(true);
    await avatar.playAudio(new ArrayBuffer(1));
    await avatar.destroy();
  });

  it('cleans up permission failures and prevents playback after destroy', async () => {
    const { avatar, sprite, capture, contexts } = setup();
    capture.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    await expect(avatar.startMicrophone()).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(contexts[0].close).toHaveBeenCalledOnce();
    await avatar.playAudio(new ArrayBuffer(1));
    expect(() => avatar.pushPCM(new Float32Array())).toThrow('stopAudio');
    await avatar.destroy();
    await avatar.destroy();
    expect(sprite.destroy).toHaveBeenCalledOnce();
    await expect(avatar.playAudio(new ArrayBuffer(1))).rejects.toThrow('destroyed');
    expect(() => avatar.pushPCM(new Float32Array())).toThrow('destroyed');
  });

  it('rejects an invalid character through the async creation API', async () => {
    vi.stubGlobal('document', { baseURI: 'https://example.test/' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const context = { clearRect: vi.fn() };
    const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
    await expect(createAvatar(canvas, { character: '/missing.json' })).rejects.toThrow('404');
    expect(context.clearRect).toHaveBeenCalled();
  });

  it('stops a microphone stream whose permission arrives after cancellation', async () => {
    const { avatar, capture, contexts } = setup();
    let release!: (stream: object) => void;
    capture.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const pending = avatar.startMicrophone();
    await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
    avatar.stopAudio();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const track = { stop: vi.fn() };
    release({ getTracks: () => [track] });
    await vi.waitFor(() => expect(track.stop).toHaveBeenCalledOnce());
    expect(contexts[0].close).toHaveBeenCalledOnce();
    await avatar.destroy();
  });

  it('reports file HTTP errors without retaining the audio context', async () => {
    const { avatar, contexts } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(avatar.playAudio('/missing.wav')).rejects.toThrow('404');
    expect(contexts[0].close).toHaveBeenCalledOnce();
    avatar.pushPCM(new Float32Array([0]));
    await avatar.destroy();
  });
});
