import { AudioClipPlayer, MicrophoneInput, StreamingTTSPlayer, TalkingSprite } from "@hh1st/hoho-avatar";
import type { AudioClipMetadata, CharacterDefinition, CharacterState } from "@hh1st/hoho-avatar";
import { loadCharacterPackage, type LoadedCharacterPackage } from "./characterPackage";
import { VoiceSession, type VoiceSessionState } from "./VoiceSession";
import "./style.css";
import "./morning.css";
import "./theme";

// Mobile browser chrome and the software keyboard change the usable viewport.
// Size the same live canvas to leave room for controls and text entry.
function updateStudioViewport() {
  document.documentElement.style.setProperty("--studio-viewport-height", `${window.visualViewport?.height ?? window.innerHeight}px`);
}
updateStudioViewport();
window.visualViewport?.addEventListener("resize", updateStudioViewport);
window.addEventListener("resize", updateStudioViewport);

const canvas = document.querySelector<HTMLCanvasElement>("#avatar")!;
const micButton = document.querySelector<HTMLButtonElement>("#micButton")!;
const buttonLabel = document.querySelector("#buttonLabel")!;
const statusText = document.querySelector("#statusText")!;
const statusDot = document.querySelector<HTMLSpanElement>("#statusDot")!;
const mouthState = document.querySelector("#mouthState")!;
const stateHint = document.querySelector("#stateHint")!;
const dbValue = document.querySelector("#dbValue")!;
const sampleRateLabel = document.querySelector("#sampleRate")!;
const bars = document.querySelector("#bars")!;
const avatarSelect = document.querySelector<HTMLSelectElement>("#avatarSelect")!;
const characterChoices = Array.from(document.querySelectorAll<HTMLButtonElement>(".character-choice"));
const customAvatarButton = document.querySelector<HTMLButtonElement>("#customAvatarButton")!;
const customAvatarName = document.querySelector<HTMLElement>("#customAvatarName")!;
const demoSampleButton = document.querySelector<HTMLButtonElement>("#demoSampleButton")!;
const stageLabel = document.querySelector("#stageLabel")!;
const stageWrap = document.querySelector<HTMLElement>(".stage-wrap")!;
const uploadButton = document.querySelector<HTMLButtonElement>("#uploadButton")!;
const avatarFile = document.querySelector<HTMLInputElement>("#avatarFile")!;
const uploadStatus = document.querySelector<HTMLElement>("#uploadStatus")!;
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
const agentStatus = document.querySelector<HTMLElement>("#agentStatus")!;
const agentTranscript = document.querySelector<HTMLElement>("#agentTranscript")!;
const agentConnectButton = document.querySelector<HTMLButtonElement>("#agentConnectButton")!;
const agentInterruptButton = document.querySelector<HTMLButtonElement>("#agentInterruptButton")!;
const agentDisconnectButton = document.querySelector<HTMLButtonElement>("#agentDisconnectButton")!;
const privacyNotice = document.querySelector<HTMLElement>("#privacyNotice")!;
const providerTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".provider-tab"));
const providerPanels = Array.from(document.querySelectorAll<HTMLElement>(".provider-panel"));
const voiceAgentTab = providerTabs.find((tab) => tab.dataset.provider === "agent");
const configuredVoiceAgentUrl = import.meta.env.VITE_VOICE_AGENT_URL?.trim();
const localVoiceAgentAvailable = import.meta.env.DEV;
const voiceAgentAvailable = localVoiceAgentAvailable || Boolean(configuredVoiceAgentUrl);

const barElements = Array.from({ length: 32 }, () => {
  const bar = document.createElement("i");
  bars.append(bar);
  return bar;
});

let sprite: TalkingSprite | undefined;
let microphone: MicrophoneInput | undefined;
let micAbort: AbortController | undefined;
let activeProvider: ProviderName = "mic";
let providerAbort = new AbortController();
let clipEpoch = 0;
let ttsEpoch = 0;
let clipLoading = false;
let customAvatar: LoadedCharacterPackage | undefined;
let clipPlayer: AudioClipPlayer | undefined;
let clipMetadata: AudioClipMetadata | undefined;
let ttsPlayer: StreamingTTSPlayer | undefined;
let ttsPlaybackStarted = false;
let kittenModule: Promise<typeof import("kitten-tts-webgpu")> | undefined;
let ttsTextEdited = false;
const avatars = {
  "niu-lai": {
    character: `${import.meta.env.BASE_URL}characters/niu-lai/character.json`,
    label: "Niu Lai",
    defaultText: "Hey, I'm Niu Lai. How's your day so far?",
  },
  "pixel-bot": {
    character: `${import.meta.env.BASE_URL}characters/pixel-bot/character.json`,
    label: "Pixel Bot",
    defaultText: "Hey, I'm Pixel Bot. What's been the best part of your day?",
  },
  "pixel-portrait": {
    character: `${import.meta.env.BASE_URL}characters/pixel-portrait/character.json`,
    label: "Pixel Portrait",
    defaultText: "Hey there. How's your day treating you?",
  },
} as const;

function selectedAvatar(): { character: string | CharacterDefinition; label: string; defaultText: string } {
  if (avatarSelect.value === "custom" && customAvatar) {
    return {
      character: customAvatar.definition,
      label: customAvatar.name,
      defaultText: `Hey, I'm ${customAvatar.name}. How's your day so far?`,
    };
  }
  return avatars[avatarSelect.value as keyof typeof avatars] ?? avatars["niu-lai"];
}

function syncDefaultTTSText() {
  if (ttsTextEdited) return;
  ttsText.value = selectedAvatar().defaultText;
  updateTTSControls();
}

function syncCharacterChoices() {
  customAvatarButton.hidden = !customAvatar;
  customAvatarName.textContent = customAvatar?.name ?? "Your character";
  for (const choice of characterChoices) {
    const selected = choice.dataset.avatar === avatarSelect.value;
    choice.classList.toggle("selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
    choice.disabled = avatarSelect.disabled;
  }
}

const hints = {
  closed: "waiting for signal",
  small: "soft articulation",
  large: "high energy",
  wide: "bright frequencies",
  round: "low vowel shape",
};

function updateMeter(energy: number) {
  const active = Math.round(energy * barElements.length);
  barElements.forEach((bar, index) => bar.classList.toggle("active", index < active));
  bars.setAttribute("aria-valuenow", Math.round(energy * 100).toString());
  const db = energy > 0 ? 20 * Math.log10(Math.max(energy * 0.28, 0.0001)) : -Infinity;
  dbValue.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "−∞ dB";
}

async function mountSelectedSprite(sampleRate: number, state: CharacterState, signal: AbortSignal = providerAbort.signal) {
  signal?.throwIfAborted();
  const avatar = selectedAvatar();
  sprite?.destroy();
  const next = new TalkingSprite(canvas, { character: avatar.character, sampleRate });
  sprite = next;
  stageLabel.textContent = avatar.label;
  stageWrap.dataset.character = avatarSelect.value;
  syncCharacterChoices();
  await next.ready;
  if (sprite !== next) return;
  next.start();
  next.setState(signal.aborted ? "idle" : state);
  if (signal.aborted) next.resetAudio();
  next.onMotion((frame) => {
    mouthState.textContent = frame.mouth.toUpperCase();
    stateHint.textContent = hints[frame.mouth];
    updateMeter(frame.energy);
  });
}

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
    onPCM: (chunk) => { if (activeProvider === "file") sprite?.pushPCM(chunk); },
    onProgress: updateClipProgress,
    onEnded: () => {
      if (activeProvider !== "file") return;
      sprite?.resetAudio();
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
  sprite?.resetAudio();
  if (activeProvider === "file") {
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
    onPCM: (chunk) => { if (activeProvider === "tts") sprite?.pushPCM(chunk); },
    minChunkCharacters: 24,
    maxChunkCharacters: 64,
    prebufferChunks: 1,
    onStateChange: (state) => {
      if (activeProvider !== "tts") { updateTTSControls(); return; }
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
      if (activeProvider !== "tts" || ttsPlayer?.state === "stopping") return;
      ttsStatus.textContent = stage.toUpperCase();
    },
    onPlaybackStart: async (metadata) => {
      const epoch = ttsEpoch;
      if (activeProvider !== "tts") return;
      if (!ttsPlaybackStarted) {
        ttsPlaybackStarted = true;
        await mountSelectedSprite(metadata.sampleRate, "speaking");
        sampleRateLabel.textContent = `${(metadata.sampleRate / 1000).toFixed(1)} kHz`;
      }
      if (epoch !== ttsEpoch || activeProvider !== "tts") return;
      ttsStatus.textContent = `STREAMING // ${ttsVoice.value.toUpperCase()}`;
      statusText.textContent = "TTS LIVE";
      statusDot.classList.add("live");
      updateTTSControls();
    },
    onEnded: () => {
      if (activeProvider !== "tts") return;
      sprite?.resetAudio();
      ttsPlaybackStarted = false;
      ttsStatus.textContent = "READY // ENGLISH / WEBGPU";
      statusText.textContent = "STANDBY";
      statusDot.classList.remove("live");
      updateTTSControls();
    },
    onError: (error) => {
      if (activeProvider !== "tts") return;
      console.error(error);
      sprite?.resetAudio();
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
  sprite?.resetAudio();
  const stopping = ttsPlayer?.state === "stopping";
  ttsStatus.textContent = stopping ? "STOPPING GPU SYNTHESIS…" : "READY // ENGLISH / WEBGPU";
  if (activeProvider === "tts") {
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
  if (epoch !== ttsEpoch || activeProvider !== "tts") return;
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
  if (expectedEpoch !== clipEpoch || activeProvider !== "file") return;
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

  if (epoch !== clipEpoch || activeProvider !== "file") return;
  clipLoading = false;
  clipMetadata = metadata;
  audioStatus.textContent = metadata.name ?? "AUDIO READY";
  sampleRateLabel.textContent = `${(metadata.sampleRate / 1000).toFixed(1)} kHz`;
  try {
    await mountSelectedSprite(metadata.sampleRate, "idle");
    if (epoch === clipEpoch && activeProvider === "file") statusText.textContent = "CLIP READY";
  } catch (error) {
    console.error(error);
    statusText.textContent = "AVATAR ERROR";
  } finally {
    audioFile.value = "";
    updateClipControls();
  }
  return epoch === clipEpoch && activeProvider === "file";
}

async function playAudioClip() {
  if (!clipMetadata || activeProvider !== "file") return;
  const epoch = clipEpoch;
  stopTTS();
  await mountSelectedSprite(clipMetadata.sampleRate, "speaking");
  if (epoch !== clipEpoch || activeProvider !== "file") return;
  await ensureClipPlayer().play();
  if (epoch !== clipEpoch || activeProvider !== "file") return;
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
    if (epoch !== clipEpoch || activeProvider !== "file") return;
    if (await loadAudioClip(sample, epoch)) await playAudioClip();
  } catch (error) {
    if (activeProvider !== "file") return;
    console.error(error);
    stopAudioClip();
    audioStatus.textContent = "UNABLE TO LOAD SAMPLE";
    statusText.textContent = "AUDIO ERROR";
  } finally {
    updateClipControls();
  }
}

async function importAvatar(file: File) {
  if (avatarSelect.disabled) return;
  uploadButton.disabled = true;
  avatarSelect.disabled = true;
  syncCharacterChoices();
  uploadStatus.classList.remove("error", "success");
  uploadStatus.textContent = `Opening ${file.name}…`;
  let nextAvatar: LoadedCharacterPackage | undefined;
  try {
    nextAvatar = await loadCharacterPackage(file);
    const previousAvatar = customAvatar;
    customAvatar = nextAvatar;
    let customOption = avatarSelect.querySelector<HTMLOptionElement>('option[value="custom"]');
    if (!customOption) {
      customOption = document.createElement("option");
      customOption.value = "custom";
      avatarSelect.append(customOption);
    }
    customOption.textContent = `CUSTOM // ${nextAvatar.name.toUpperCase()}`;
    avatarSelect.value = "custom";
    try {
      const state: CharacterState = microphone ? "listening" : clipPlayer?.state === "playing" ? "speaking" : "idle";
      await mountSelectedSprite(currentSampleRate(), state);
      syncDefaultTTSText();
      previousAvatar?.dispose();
    } catch (error) {
      customAvatar = previousAvatar;
      nextAvatar.dispose();
      if (previousAvatar) customOption.textContent = `CUSTOM // ${previousAvatar.name.toUpperCase()}`;
      else customOption.remove();
      avatarSelect.value = previousAvatar ? "custom" : "niu-lai";
      const state: CharacterState = microphone ? "listening" : clipPlayer?.state === "playing" ? "speaking" : "idle";
      await mountSelectedSprite(currentSampleRate(), state);
      throw error;
    }
    uploadStatus.textContent = `${nextAvatar.name} loaded locally`;
    uploadStatus.classList.add("success");
  } catch (error) {
    console.error(error);
    uploadStatus.textContent = error instanceof Error ? error.message : "Unable to load this character ZIP.";
    uploadStatus.classList.add("error");
  } finally {
    uploadButton.disabled = false;
    avatarSelect.disabled = false;
    syncCharacterChoices();
    avatarFile.value = "";
  }
}

async function startMic() {
  if (microphone || activeProvider !== "mic") return;
  const capture = new MicrophoneInput((chunk) => {
    if (microphone === capture && activeProvider === "mic") sprite?.pushPCM(chunk);
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
    await mountSelectedSprite(capture.sampleRate, "listening", abort.signal);
    if (microphone !== capture) return;
    sampleRateLabel.textContent = `${(capture.sampleRate / 1000).toFixed(1)} kHz`;
    micButton.classList.add("recording");
    buttonLabel.textContent = "Stop microphone";
    statusText.textContent = "MIC LIVE";
    statusDot.classList.add("live");
  } catch (error) {
    if (microphone !== capture) return;
    await stopMic();
    if (activeProvider === "mic") {
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
  sprite?.resetAudio();
  sprite?.setState("idle");
  if (activeProvider === "mic") {
    statusText.textContent = "STANDBY";
    statusDot.classList.remove("live");
  }
  return capture?.destroy() ?? Promise.resolve();
}

function voiceAgentUrl(): string {
  if (configuredVoiceAgentUrl) return configuredVoiceAgentUrl;
  const url = new URL("/voice-agent", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

const voiceSession = new VoiceSession({
  gatewayUrl: voiceAgentUrl(),
  healthUrl: localVoiceAgentAvailable && !configuredVoiceAgentUrl ? "/voice-agent/healthz" : undefined,
  onPCM: (chunk) => { if (activeProvider === "agent") sprite?.pushPCM(chunk); },
  onReset: () => { if (activeProvider === "agent") sprite?.resetAudio(); },
  onTranscript: (text) => { agentTranscript.textContent = text; },
  onReady: async (sampleRate, signal) => {
    await mountSelectedSprite(sampleRate, "listening", signal);
    if (!signal.aborted) sampleRateLabel.textContent = `${(sampleRate / 1000).toFixed(1)} kHz`;
  },
  onState: (state, error) => {
    updateVoiceAgentControls(state);
    agentStatus.textContent = error?.message ?? state.toUpperCase();
    if (activeProvider !== "agent") return;
    statusText.textContent = `AGENT ${state.toUpperCase()}`;
    const live = state === "listening" || state === "thinking" || state === "speaking";
    statusDot.classList.toggle("live", live);
    sprite?.setState(live ? state : "idle");
    if (!live) sprite?.resetAudio();
  },
});

function currentSampleRate(): number {
  return (activeProvider === "agent" ? voiceSession.sampleRate : microphone?.sampleRate) ?? clipMetadata?.sampleRate ?? 48000;
}

function updateVoiceAgentControls(state: VoiceSessionState = voiceSession.state) {
  const live = state === "listening" || state === "thinking" || state === "speaking";
  agentConnectButton.disabled = state === "connecting" || state === "stopping" || live;
  agentConnectButton.textContent = state === "error" ? "Retry connection" : "Start conversation";
  agentInterruptButton.disabled = !live;
  agentDisconnectButton.disabled = state !== "connecting" && !live;
}

type ProviderName = "mic" | "file" | "tts" | "agent";

function selectProvider(provider: ProviderName) {
  if (provider === activeProvider || (provider === "agent" && !voiceAgentAvailable)) return;
  activeProvider = provider;
  providerAbort.abort();
  providerAbort = new AbortController();
  // Invalidate old work synchronously before any awaited teardown finishes.
  if (provider !== "agent") void voiceSession.stop();
  if (provider !== "mic") void stopMic();
  if (provider !== "file") {
    stopAudioClip();
    const previous = clipPlayer;
    clipPlayer = undefined;
    clipMetadata = undefined;
    void previous?.destroy();
    updateClipControls();
  }
  if (provider !== "tts") stopTTS();
  sprite?.resetAudio();
  sprite?.setState("idle");
  void mountSelectedSprite(currentSampleRate(), "idle").catch(console.error);
  statusText.textContent = "STANDBY";
  statusDot.classList.remove("live");
  for (const tab of providerTabs) {
    const active = tab.dataset.provider === provider;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of providerPanels) {
    const active = panel.dataset.providerPanel === provider;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  }
  privacyNotice.textContent = provider === "agent"
    ? "Voice conversations send microphone audio to Azure OpenAI."
    : "Just between you and your browser. Audio stays here.";
}

micButton.addEventListener("click", () => {
  if (microphone) void stopMic(); else void startMic();
});

avatarSelect.addEventListener("change", async () => {
  avatarSelect.disabled = true;
  uploadButton.disabled = true;
  syncCharacterChoices();
  try {
    const state: CharacterState = microphone ? "listening" : clipPlayer?.state === "playing" || ttsPlayer?.state === "playing" ? "speaking" : "idle";
    await mountSelectedSprite(currentSampleRate(), state);
    syncDefaultTTSText();
  } catch (error) {
    uploadStatus.textContent = error instanceof Error ? error.message : "Unable to load this character.";
    uploadStatus.classList.add("error");
  } finally {
    avatarSelect.disabled = false;
    uploadButton.disabled = false;
    syncCharacterChoices();
  }
});

for (const choice of characterChoices) {
  choice.addEventListener("click", () => {
    if (avatarSelect.disabled || avatarSelect.value === choice.dataset.avatar) return;
    avatarSelect.value = choice.dataset.avatar!;
    avatarSelect.dispatchEvent(new Event("change"));
  });
}

demoSampleButton.addEventListener("click", () => {
  selectProvider("file");
  if (window.matchMedia("(max-width: 850px)").matches) {
    document.querySelector(".provider-section")?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  void playSampleAudio();
});

uploadButton.addEventListener("click", () => avatarFile.click());
avatarFile.addEventListener("change", () => {
  const file = avatarFile.files?.[0];
  if (file) void importAvatar(file);
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
agentConnectButton.addEventListener("click", () => {
  if (activeProvider !== "agent") return;
  void voiceSession.start({
    voice: "cedar",
    instructions: `You are ${selectedAvatar().label}, a warm and concise voice companion. Keep spoken responses short and natural.`,
  });
});
agentInterruptButton.addEventListener("click", () => voiceSession.interrupt());
agentDisconnectButton.addEventListener("click", () => void voiceSession.stop());
for (const tab of providerTabs) {
  tab.addEventListener("click", () => void selectProvider(tab.dataset.provider as ProviderName));
  tab.addEventListener("keydown", (event) => {
    const available = providerTabs.filter((item) => !item.disabled);
    const index = available.indexOf(tab);
    let next: HTMLButtonElement | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = available[(index + 1) % available.length];
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = available[(index - 1 + available.length) % available.length];
    if (event.key === "Home") next = available[0];
    if (event.key === "End") next = available.at(-1);
    if (!next) return;
    event.preventDefault();
    selectProvider(next.dataset.provider as ProviderName);
    next.focus();
  });
}

for (const eventName of ["dragenter", "dragover"]) {
  stageWrap.addEventListener(eventName, (event) => {
    event.preventDefault();
    stageWrap.classList.add("dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  stageWrap.addEventListener(eventName, (event) => {
    event.preventDefault();
    stageWrap.classList.remove("dragging");
  });
}
stageWrap.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void importAvatar(file);
});

window.addEventListener("beforeunload", () => {
  micAbort?.abort();
  void microphone?.destroy();
  void clipPlayer?.destroy();
  void ttsPlayer?.destroy();
  void voiceSession.stop();
  customAvatar?.dispose();
});

mountSelectedSprite(48000, "idle").catch(console.error);
updateClipControls();
updateTTSControls();
updateVoiceAgentControls();
if (!voiceAgentAvailable && voiceAgentTab) {
  voiceAgentTab.disabled = true;
  voiceAgentTab.setAttribute("aria-disabled", "true");
  const description = voiceAgentTab.querySelector("small");
  if (description) description.textContent = "Gateway not configured";
}
