import { AudioClipPlayer, CharacterState } from '../../src';
import type { AudioClipMetadata } from '../../src';
import { element } from './studioDom';
import type { AudioControlContext } from './studioTypes';

export function createClipControls(context: AudioControlContext, stopTTS: () => void) {
  const { stage, provider, mountSelectedAvatar, status } = context;
  const sampleAudioButton = element<HTMLButtonElement>("#sampleAudioButton");
  const audioChooseButton = element<HTMLButtonElement>("#audioChooseButton");
  const audioFile = element<HTMLInputElement>("#audioFile");
  const audioPlayButton = element<HTMLButtonElement>("#audioPlayButton");
  const audioStopButton = element<HTMLButtonElement>("#audioStopButton");
  const audioStatus = element<HTMLElement>("#audioStatus");
  const audioProgress = element<HTMLElement>("#audioProgress");
  const audioTrack = element<HTMLElement>("#audioTrack");
  const audioTrackFill = element<HTMLElement>("#audioTrackFill");
  const demoSampleButton = element<HTMLButtonElement>('#demoSampleButton');
  const events = new AbortController();
  let clipEpoch = 0;
  let clipLoading = false;
  let clipPlayer: AudioClipPlayer | undefined;
  let clipMetadata: AudioClipMetadata | undefined;

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
        status.show("CLIP READY");
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
      status.show(clipMetadata ? "CLIP READY" : "STANDBY");
    }
    updateClipControls();
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
      status.show("AUDIO ERROR");
      audioFile.value = "";
      updateClipControls();
      return;
    }

    if (epoch !== clipEpoch || provider() !== "file") return;
    clipLoading = false;
    clipMetadata = metadata;
    audioStatus.textContent = metadata.name ?? "AUDIO READY";
    status.showSampleRate(metadata.sampleRate);
    try {
      await mountSelectedAvatar(metadata.sampleRate, CharacterState.Idle);
      if (epoch === clipEpoch && provider() === "file") status.show("CLIP READY");
    } catch (error) {
      console.error(error);
      status.show("AVATAR ERROR");
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
    status.show("AUDIO LIVE", true);
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
      const sample = new File([await response.arrayBuffer()], "A little hello — English.wav", { type: "audio/wav" });
      if (epoch !== clipEpoch || provider() !== "file") return;
      if (await loadAudioClip(sample, epoch)) await playAudioClip();
    } catch (error) {
      if (provider() !== "file") return;
      console.error(error);
      stopAudioClip();
      audioStatus.textContent = "UNABLE TO LOAD SAMPLE";
      status.show("AUDIO ERROR");
    } finally {
      updateClipControls();
    }
  }

  audioChooseButton.addEventListener("click", () => audioFile.click(), { signal: events.signal });
  sampleAudioButton.addEventListener("click", () => void playSampleAudio(), { signal: events.signal });
  audioFile.addEventListener("change", () => {
    const file = audioFile.files?.[0];
    if (file) void loadAudioClip(file);
  }, { signal: events.signal });
  audioPlayButton.addEventListener("click", async () => {
    audioPlayButton.disabled = true;
    try {
      await playAudioClip();
    } catch (error) {
      console.error(error);
      stopAudioClip();
      status.show("PLAYBACK ERROR");
    } finally {
      updateClipControls();
    }
  }, { signal: events.signal });
  audioStopButton.addEventListener("click", stopAudioClip, { signal: events.signal });
  updateClipControls();
  return {
    playSample: playSampleAudio,
    stop: stopAudioClip,
    get playing() { return clipPlayer?.state === 'playing'; },
    get loaded() { return Boolean(clipMetadata); },
    get sampleRate() { return clipMetadata?.sampleRate; },
    clear() {
      stopAudioClip();
      const previous = clipPlayer;
      clipPlayer = undefined;
      clipMetadata = undefined;
      void previous?.destroy();
      updateClipControls();
    },
    dispose() { events.abort(); void clipPlayer?.destroy(); },
  };
}
