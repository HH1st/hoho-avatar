import { AudioClipPlayer, MicrophoneInput, StreamingTTSPlayer, CharacterState } from '../../src';
import type { AudioClipMetadata } from '../../src';
import type { CharacterStage } from './CharacterStage';

export type ProviderName = 'mic' | 'file' | 'tts' | 'agent';
interface StudioAudioOptions {
  stage: CharacterStage;
  provider(): ProviderName;
  mountSelectedAvatar(rate: number, state: CharacterState, signal?: AbortSignal): Promise<void>;
  statusText: Element;
  statusDot: HTMLElement;
  sampleRateLabel: Element;
  demoSampleButton: HTMLButtonElement;
}

/** Owns local audio sessions and their controls; never owns a character renderer. */
export function createStudioAudio({ stage, provider, mountSelectedAvatar, statusText, statusDot, sampleRateLabel, demoSampleButton }: StudioAudioOptions) {
  const micButton = document.querySelector<HTMLButtonElement>("#micButton")!;
  const buttonLabel = document.querySelector("#buttonLabel")!;
  const sampleAudioButton = document.querySelector<HTMLButtonElement>("#sampleAudioButton")!;
  const audioChooseButton = document.querySelector<HTMLButtonElement>("#audioChooseButton")!;
  const audioFile = document.querySelector<HTMLInputElement>("#audioFile")!;
  const audioPlayButton = document.querySelector<HTMLButtonElement>("#audioPlayButton")!;
  const audioStopButton = document.querySelector<HTMLButtonElement>("#audioStopButton")!;
  const audioStatus = document.querySelector<HTMLElement>("#audioStatus")!;
  const audioProgress = document.querySelector<HTMLElement>("#audioProgress")!;
  const audioTrack = document.querySelector<HTMLElement>("#audioTrack")!;
  const audioTrackFill = document.querySelector<HTMLElement>("#audioTrackFill")!;
  const ttsText = document.querySelector<HTMLTextAreaElement>("#ttsText")!;
  const ttsVoice = document.querySelector<HTMLSelectElement>("#ttsVoice")!;
  const ttsSpeed = document.querySelector<HTMLSelectElement>("#ttsSpeed")!;
  const ttsMode = document.querySelector<HTMLSelectElement>("#ttsMode")!;
  const ttsSpeakButton = document.querySelector<HTMLButtonElement>("#ttsSpeakButton")!;
  const ttsStopButton = document.querySelector<HTMLButtonElement>("#ttsStopButton")!;
  const ttsStatus = document.querySelector<HTMLElement>("#ttsStatus")!;
  let microphone: MicrophoneInput | undefined;
  let micAbort: AbortController | undefined;
  let clipEpoch = 0;
  let ttsEpoch = 0;
  let clipLoading = false;
  let clipPlayer: AudioClipPlayer | undefined;
  let clipMetadata: AudioClipMetadata | undefined;
  let ttsPlayer: StreamingTTSPlayer | undefined;
  let ttsPlaybackStarted = false;
  let ttsSampleRate = 48_000;
  let kittenModule: Promise<typeof import("kitten-tts-webgpu")> | undefined;
  let ttsTextEdited = false;

  function formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
  }

  function updateClipProgress(currentTime: number, duration: number) {
    audioProgress.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
    const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
    audioTrack.setAttribute("aria-valuenow", Math.round(percent).toString());
    audioTrackFill.style.width = `${percent}%`;
  }

  function updateClipControls() {
    const state = clipPlayer?.state ?? "empty";
    sampleAudioButton.disabled = clipLoading || state === "loading" || state === "playing";
    demoSampleButton.disabled = sampleAudioButton.disabled;
    audioChooseButton.disabled = clipLoading || state === "loading";
    audioPlayButton.disabled = clipLoading || !clipMetadata || state === "loading" || state === "playing";
    audioStopButton.disabled = state !== "playing";
  }

  function ensureClipPlayer(): AudioClipPlayer {
    clipPlayer ??= new AudioClipPlayer({
      onPCM: (chunk) => { if (provider() === "file") stage.avatar?.pushPCM(chunk); },
      onProgress: updateClipProgress,
      onEnded: () => {
        if (provider() !== "file") return;
        stage.resetAudio();
        statusText.textContent = "CLIP READY";
        statusDot.classList.remove("live");
        audioStatus.textContent = clipMetadata?.name ?? "AUDIO READY";
        updateClipControls();
      },
    });
    return clipPlayer;
  }

  function stopAudioClip() {
    ++clipEpoch;
    clipLoading = false;
    if (clipPlayer?.state === "playing") clipPlayer.stop();
    stage.resetAudio();
    if (provider() === "file") {
      statusText.textContent = clipMetadata ? "CLIP READY" : "STANDBY";
      statusDot.classList.remove("live");
    }
    updateClipControls();
  }

  function updateTTSControls() {
    const state = ttsPlayer?.state ?? "idle";
    const busy = state === "synthesizing" || state === "playing" || state === "stopping";
    ttsSpeakButton.disabled = busy || !ttsText.value.trim();
    ttsStopButton.disabled = state !== "synthesizing" && state !== "playing";
    ttsText.disabled = busy;
    ttsVoice.disabled = busy;
    ttsSpeed.disabled = busy;
    ttsMode.disabled = busy;
  }

  function ensureTTSPlayer(): StreamingTTSPlayer {
    ttsPlayer ??= new StreamingTTSPlayer({
      synthesize: async (text, options) => {
        kittenModule ??= import("kitten-tts-webgpu");
        const { textToSpeech } = await kittenModule;
        return textToSpeech(text, {
          model: "nano",
          voice: ttsVoice.value,
          speed: Number(ttsSpeed.value),
          onProgress: options.onProgress,
        });
      },
      onPCM: (chunk) => { if (provider() === "tts") stage.avatar?.pushPCM(chunk); },
      minChunkCharacters: 24,
      maxChunkCharacters: 64,
      prebufferChunks: 1,
      onStateChange: (state) => {
        if (provider() !== "tts") { updateTTSControls(); return; }
        if (state === "stopping") {
          ttsStatus.textContent = "STOPPING GPU SYNTHESIS…";
          statusText.textContent = "TTS STOPPING";
          statusDot.classList.remove("live");
        } else if (state === "idle" && statusText.textContent === "TTS STOPPING") {
          ttsStatus.textContent = "READY // ENGLISH / WEBGPU";
          statusText.textContent = clipMetadata ? "CLIP READY" : "STANDBY";
        }
        updateTTSControls();
      },
      onProgress: (stage) => {
        if (provider() !== "tts" || ttsPlayer?.state === "stopping") return;
        ttsStatus.textContent = stage.toUpperCase();
      },
      onPlaybackStart: async (metadata) => {
        const epoch = ttsEpoch;
        if (provider() !== "tts") return;
        if (!ttsPlaybackStarted) {
          ttsPlaybackStarted = true;
          ttsSampleRate = metadata.sampleRate;
          await mountSelectedAvatar(metadata.sampleRate, CharacterState.Speaking);
          sampleRateLabel.textContent = `${(metadata.sampleRate / 1000).toFixed(1)} kHz`;
        }
        if (epoch !== ttsEpoch || provider() !== "tts") return;
        ttsStatus.textContent = `STREAMING // ${ttsVoice.value.toUpperCase()}`;
        statusText.textContent = "TTS LIVE";
        statusDot.classList.add("live");
        updateTTSControls();
      },
      onEnded: () => {
        if (provider() !== "tts") return;
        stage.resetAudio();
        ttsPlaybackStarted = false;
        ttsStatus.textContent = "READY // ENGLISH / WEBGPU";
        statusText.textContent = "STANDBY";
        statusDot.classList.remove("live");
        updateTTSControls();
      },
      onError: (error) => {
        if (provider() !== "tts") return;
        console.error(error);
        stage.resetAudio();
        ttsPlaybackStarted = false;
        ttsStatus.textContent = error instanceof Error ? error.message.toUpperCase() : "TTS FAILED";
        statusText.textContent = "TTS ERROR";
        statusDot.classList.remove("live");
        updateTTSControls();
      },
    });
    return ttsPlayer;
  }

  function stopTTS() {
    ++ttsEpoch;
    if (ttsPlayer && ttsPlayer.state !== "idle" && ttsPlayer.state !== "destroyed") ttsPlayer.stop();
    ttsPlaybackStarted = false;
    stage.resetAudio();
    const stopping = ttsPlayer?.state === "stopping";
    ttsStatus.textContent = stopping ? "STOPPING GPU SYNTHESIS…" : "READY // ENGLISH / WEBGPU";
    if (provider() === "tts") {
      statusText.textContent = stopping ? "TTS STOPPING" : clipMetadata ? "CLIP READY" : "STANDBY";
      statusDot.classList.remove("live");
    }
    updateTTSControls();
  }

  async function speakTTS() {
    const text = ttsText.value.trim();
    if (!text) return;
    if (!("gpu" in navigator)) {
      ttsStatus.textContent = "WEBGPU IS NOT AVAILABLE";
      statusText.textContent = "TTS UNSUPPORTED";
      return;
    }
    stopAudioClip();
    const epoch = ++ttsEpoch;
    const player = ensureTTSPlayer();
    await player.prepare();
    if (epoch !== ttsEpoch || provider() !== "tts") return;
    ttsPlaybackStarted = false;
    ttsStatus.textContent = "STARTING KITTEN TTS…";
    statusText.textContent = "TTS LOADING";
    statusDot.classList.remove("live");
    if (ttsMode.value === "smooth") {
      ttsStatus.textContent = "GENERATING COMPLETE AUDIO…";
      player.speakComplete(text);
    } else {
      player.speak(text);
    }
    updateTTSControls();
  }

  async function loadAudioClip(file: File, expectedEpoch = clipEpoch) {
    if (expectedEpoch !== clipEpoch || provider() !== "file") return;
    stopTTS();
    stopAudioClip();
    const epoch = clipEpoch;
    clipLoading = true;
    const player = ensureClipPlayer();
    audioStatus.textContent = `DECODING ${file.name}`;
    clipMetadata = undefined;
    updateClipControls();

    let metadata: AudioClipMetadata;
    try {
      metadata = await player.load(file);
    } catch (error) {
      if (epoch !== clipEpoch) return;
      clipLoading = false;
      console.error(error);
      audioStatus.textContent = error instanceof DOMException && error.name === "AbortError" ? "AUDIO REPLACED" : "UNABLE TO DECODE AUDIO";
      statusText.textContent = "AUDIO ERROR";
      audioFile.value = "";
      updateClipControls();
      return;
    }

    if (epoch !== clipEpoch || provider() !== "file") return;
    clipLoading = false;
    clipMetadata = metadata;
    audioStatus.textContent = metadata.name ?? "AUDIO READY";
    sampleRateLabel.textContent = `${(metadata.sampleRate / 1000).toFixed(1)} kHz`;
    try {
      await mountSelectedAvatar(metadata.sampleRate, CharacterState.Idle);
      if (epoch === clipEpoch && provider() === "file") statusText.textContent = "CLIP READY";
    } catch (error) {
      console.error(error);
      statusText.textContent = "AVATAR ERROR";
    } finally {
      audioFile.value = "";
      updateClipControls();
    }
    return epoch === clipEpoch && provider() === "file";
  }

  async function playAudioClip() {
    if (!clipMetadata || provider() !== "file") return;
    const epoch = clipEpoch;
    stopTTS();
    await mountSelectedAvatar(clipMetadata.sampleRate, CharacterState.Speaking);
    if (epoch !== clipEpoch || provider() !== "file") return;
    await ensureClipPlayer().play();
    if (epoch !== clipEpoch || provider() !== "file") return;
    audioStatus.textContent = `PLAYING ${clipMetadata.name ?? "AUDIO"}`;
    statusText.textContent = "AUDIO LIVE";
    statusDot.classList.add("live");
    updateClipControls();
  }

  async function playSampleAudio() {
    const epoch = ++clipEpoch;
    clipLoading = true;
    sampleAudioButton.disabled = true;
    audioStatus.textContent = "LOADING SAMPLE VOICE";
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}audio/sample-voice.wav`);
      if (!response.ok) throw new Error(`Unable to load sample audio (${response.status}).`);
      const sample = new File([await response.arrayBuffer()], "hoho-sample-voice.wav", { type: "audio/wav" });
      if (epoch !== clipEpoch || provider() !== "file") return;
      if (await loadAudioClip(sample, epoch)) await playAudioClip();
    } catch (error) {
      if (provider() !== "file") return;
      console.error(error);
      stopAudioClip();
      audioStatus.textContent = "UNABLE TO LOAD SAMPLE";
      statusText.textContent = "AUDIO ERROR";
    } finally {
      updateClipControls();
    }
  }

  async function startMic() {
    if (microphone || provider() !== "mic") return;
    const capture = new MicrophoneInput((chunk) => {
      if (microphone === capture && provider() === "mic") stage.avatar?.pushPCM(chunk);
    });
    const abort = new AbortController();
    microphone = capture;
    micAbort = abort;
    buttonLabel.textContent = "Cancel microphone";
    statusText.textContent = "REQUESTING MIC";
    try {
      await capture.prepare();
      await capture.start(abort.signal);
      if (microphone !== capture) return;
      await mountSelectedAvatar(capture.sampleRate, CharacterState.Listening, abort.signal);
      if (microphone !== capture) return;
      sampleRateLabel.textContent = `${(capture.sampleRate / 1000).toFixed(1)} kHz`;
      micButton.classList.add("recording");
      buttonLabel.textContent = "Stop microphone";
      statusText.textContent = "MIC LIVE";
      statusDot.classList.add("live");
    } catch {
      if (microphone !== capture) return;
      await stopMic();
      if (provider() === "mic") {
        statusText.textContent = "MIC BLOCKED";
        buttonLabel.textContent = "Try again";
      }
    }
  }

  function stopMic(): Promise<void> {
    const capture = microphone;
    microphone = undefined;
    micAbort?.abort();
    micAbort = undefined;
    micButton.classList.remove("recording");
    buttonLabel.textContent = "Start microphone";
    stage.resetAudio();
    stage.setState(CharacterState.Idle);
    if (provider() === "mic") {
      statusText.textContent = "STANDBY";
      statusDot.classList.remove("live");
    }
    return capture?.destroy() ?? Promise.resolve();
  }

  micButton.addEventListener("click", () => {
    if (microphone) void stopMic(); else void startMic();
  });

  audioChooseButton.addEventListener("click", () => audioFile.click());
  sampleAudioButton.addEventListener("click", () => void playSampleAudio());
  audioFile.addEventListener("change", () => {
    const file = audioFile.files?.[0];
    if (file) void loadAudioClip(file);
  });
  audioPlayButton.addEventListener("click", async () => {
    audioPlayButton.disabled = true;
    try {
      await playAudioClip();
    } catch (error) {
      console.error(error);
      stopAudioClip();
      statusText.textContent = "PLAYBACK ERROR";
    } finally {
      updateClipControls();
    }
  });
  audioStopButton.addEventListener("click", stopAudioClip);
  ttsText.addEventListener("input", () => {
    ttsTextEdited = true;
    updateTTSControls();
  });
  ttsSpeakButton.addEventListener("click", async () => {
    try {
      await speakTTS();
    } catch (error) {
      console.error(error);
      ttsStatus.textContent = error instanceof Error ? error.message.toUpperCase() : "TTS FAILED";
      statusText.textContent = "TTS ERROR";
      updateTTSControls();
    }
  });
  ttsStopButton.addEventListener("click", stopTTS);
  updateClipControls(); updateTTSControls();
  return {
    playSample: playSampleAudio,
    get state(): CharacterState {
      return microphone ? CharacterState.Listening : clipPlayer?.state === 'playing' || ttsPlayer?.state === 'playing' ? CharacterState.Speaking : CharacterState.Idle;
    },
    get sampleRate(): number { return provider() === 'tts' ? ttsSampleRate : microphone?.sampleRate ?? clipMetadata?.sampleRate ?? 48_000; },
    setDefaultText(text: string) { if (!ttsTextEdited) { ttsText.value = text; updateTTSControls(); } },
    selectProvider(next: ProviderName) {
      if (next !== 'mic') void stopMic();
      if (next !== 'file') {
        stopAudioClip(); const previous = clipPlayer; clipPlayer = undefined; clipMetadata = undefined;
        void previous?.destroy(); updateClipControls();
      }
      if (next !== 'tts') stopTTS();
    },
    dispose() { micAbort?.abort(); void microphone?.destroy(); void clipPlayer?.destroy(); void ttsPlayer?.destroy(); },
  };
}
