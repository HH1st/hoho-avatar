import { StreamingTTSPlayer, CharacterState } from '../../src';
import { element } from './studioDom';
import type { AudioControlContext } from './studioTypes';

export function createTTSControls(context: AudioControlContext, stopAudioClip: () => void, hasClip: () => boolean) {
  const { stage, provider, mountSelectedAvatar, status } = context;
  const ttsText = element<HTMLTextAreaElement>("#ttsText");
  const ttsVoice = element<HTMLSelectElement>("#ttsVoice");
  const ttsSpeed = element<HTMLSelectElement>("#ttsSpeed");
  const ttsMode = element<HTMLSelectElement>("#ttsMode");
  const ttsSpeakButton = element<HTMLButtonElement>("#ttsSpeakButton");
  const ttsStopButton = element<HTMLButtonElement>("#ttsStopButton");
  const ttsStatus = element<HTMLElement>("#ttsStatus");
  const events = new AbortController();
  let ttsEpoch = 0;
  let ttsStopping = false;
  let ttsPlayer: StreamingTTSPlayer | undefined;
  let ttsPlaybackStarted = false;
  let ttsSampleRate = 48_000;
  let kittenModule: Promise<typeof import("kitten-tts-webgpu")> | undefined;
  let ttsTextEdited = false;

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
          ttsStopping = true;
          ttsStatus.textContent = "STOPPING GPU SYNTHESIS…";
          status.show("TTS STOPPING");
        } else if (state === "idle" && ttsStopping) {
          ttsStopping = false;
          ttsStatus.textContent = "READY // ENGLISH / WEBGPU";
          status.show(hasClip() ? "CLIP READY" : "STANDBY");
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
          status.showSampleRate(metadata.sampleRate);
        }
        if (epoch !== ttsEpoch || provider() !== "tts") return;
        ttsStatus.textContent = `STREAMING // ${ttsVoice.value.toUpperCase()}`;
        status.show("TTS LIVE", true);
        updateTTSControls();
      },
      onEnded: () => {
        if (provider() !== "tts") return;
        stage.resetAudio();
        ttsPlaybackStarted = false;
        ttsStatus.textContent = "READY // ENGLISH / WEBGPU";
        status.show("STANDBY");
        updateTTSControls();
      },
      onError: (error) => {
        if (provider() !== "tts") return;
        console.error(error);
        stage.resetAudio();
        ttsPlaybackStarted = false;
        ttsStatus.textContent = error instanceof Error ? error.message.toUpperCase() : "TTS FAILED";
        status.show("TTS ERROR");
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
    ttsStopping = stopping;
    ttsStatus.textContent = stopping ? "STOPPING GPU SYNTHESIS…" : "READY // ENGLISH / WEBGPU";
    if (provider() === "tts") {
      status.show(stopping ? "TTS STOPPING" : hasClip() ? "CLIP READY" : "STANDBY");
    }
    updateTTSControls();
  }

  async function speakTTS() {
    const text = ttsText.value.trim();
    if (!text) return;
    if (!("gpu" in navigator)) {
      ttsStatus.textContent = "WEBGPU IS NOT AVAILABLE";
      status.show("TTS UNSUPPORTED");
      return;
    }
    stopAudioClip();
    const epoch = ++ttsEpoch;
    const player = ensureTTSPlayer();
    await player.prepare();
    if (epoch !== ttsEpoch || provider() !== "tts") return;
    ttsPlaybackStarted = false;
    ttsStatus.textContent = "STARTING KITTEN TTS…";
    status.show("TTS LOADING");
    if (ttsMode.value === "smooth") {
      ttsStatus.textContent = "GENERATING COMPLETE AUDIO…";
      player.speakComplete(text);
    } else {
      player.speak(text);
    }
    updateTTSControls();
  }

  ttsText.addEventListener("input", () => {
    ttsTextEdited = true;
    updateTTSControls();
  }, { signal: events.signal });
  ttsSpeakButton.addEventListener("click", async () => {
    try {
      await speakTTS();
    } catch (error) {
      console.error(error);
      ttsStatus.textContent = error instanceof Error ? error.message.toUpperCase() : "TTS FAILED";
      status.show("TTS ERROR");
      updateTTSControls();
    }
  }, { signal: events.signal });
  ttsStopButton.addEventListener("click", stopTTS, { signal: events.signal });
  updateTTSControls();
  return {
    stop: stopTTS,
    get playing() { return ttsPlayer?.state === 'playing'; },
    get sampleRate() { return ttsSampleRate; },
    setDefaultText(text: string) {
      if (!ttsTextEdited) { ttsText.value = text; updateTTSControls(); }
    },
    dispose() { events.abort(); void ttsPlayer?.destroy(); },
  };
}
