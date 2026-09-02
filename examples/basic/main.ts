import { AudioClipPlayer, TalkingSprite } from "../../src";
import type { AudioClipMetadata, CharacterDefinition, CharacterState } from "../../src";
import { loadCharacterPackage, type LoadedCharacterPackage } from "./characterPackage";
import "./style.css";

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
const stageLabel = document.querySelector("#stageLabel")!;
const stageWrap = document.querySelector<HTMLElement>(".stage-wrap")!;
const uploadButton = document.querySelector<HTMLButtonElement>("#uploadButton")!;
const avatarFile = document.querySelector<HTMLInputElement>("#avatarFile")!;
const uploadStatus = document.querySelector<HTMLElement>("#uploadStatus")!;
const audioChooseButton = document.querySelector<HTMLButtonElement>("#audioChooseButton")!;
const audioFile = document.querySelector<HTMLInputElement>("#audioFile")!;
const audioPlayButton = document.querySelector<HTMLButtonElement>("#audioPlayButton")!;
const audioStopButton = document.querySelector<HTMLButtonElement>("#audioStopButton")!;
const audioStatus = document.querySelector<HTMLElement>("#audioStatus")!;
const audioProgress = document.querySelector<HTMLElement>("#audioProgress")!;
const audioTrack = document.querySelector<HTMLElement>("#audioTrack")!;
const audioTrackFill = document.querySelector<HTMLElement>("#audioTrackFill")!;

const barElements = Array.from({ length: 32 }, () => {
  const bar = document.createElement("i");
  bars.append(bar);
  return bar;
});

let sprite: TalkingSprite | undefined;
let stream: MediaStream | undefined;
let audioContext: AudioContext | undefined;
let processor: ScriptProcessorNode | undefined;
let source: MediaStreamAudioSourceNode | undefined;
let sink: GainNode | undefined;
let customAvatar: LoadedCharacterPackage | undefined;
let clipPlayer: AudioClipPlayer | undefined;
let clipMetadata: AudioClipMetadata | undefined;

const avatars = {
  "niu-lai": {
    character: `${import.meta.env.BASE_URL}characters/niu-lai/character.json`,
    label: "AVATAR // NIU LAI",
  },
  "pixel-bot": {
    character: `${import.meta.env.BASE_URL}characters/pixel-bot/character.json`,
    label: "AVATAR // PIXEL BOT",
  },
  "pixel-portrait": {
    character: `${import.meta.env.BASE_URL}characters/pixel-portrait/character.json`,
    label: "AVATAR // PIXEL PORTRAIT",
  },
} as const;

function selectedAvatar(): { character: string | CharacterDefinition; label: string } {
  if (avatarSelect.value === "custom" && customAvatar) {
    return { character: customAvatar.definition, label: `AVATAR // ${customAvatar.name.toUpperCase()}` };
  }
  return avatars[avatarSelect.value as keyof typeof avatars] ?? avatars["niu-lai"];
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

async function mountSelectedSprite(sampleRate: number, state: CharacterState) {
  const avatar = selectedAvatar();
  sprite?.destroy();
  const next = new TalkingSprite(canvas, { character: avatar.character, sampleRate });
  sprite = next;
  stageLabel.textContent = avatar.label;
  await next.ready;
  if (sprite !== next) {
    next.destroy();
    return;
  }
  next.start();
  next.setState(state);
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
  audioChooseButton.disabled = state === "loading";
  audioPlayButton.disabled = !clipMetadata || state === "loading" || state === "playing";
  audioStopButton.disabled = state !== "playing";
}

function ensureClipPlayer(): AudioClipPlayer {
  clipPlayer ??= new AudioClipPlayer({
    onPCM: (chunk) => sprite?.pushPCM(chunk),
    onProgress: updateClipProgress,
    onEnded: () => {
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
  if (clipPlayer?.state === "playing") clipPlayer.stop();
  sprite?.resetAudio();
  if (!stream) {
    statusText.textContent = clipMetadata ? "CLIP READY" : "STANDBY";
    statusDot.classList.remove("live");
  }
  updateClipControls();
}

async function loadAudioClip(file: File) {
  if (stream) await stopMic();
  stopAudioClip();
  const player = ensureClipPlayer();
  audioStatus.textContent = `DECODING ${file.name}`;
  clipMetadata = undefined;
  updateClipControls();

  let metadata: AudioClipMetadata;
  try {
    metadata = await player.load(file);
  } catch (error) {
    console.error(error);
    audioStatus.textContent = error instanceof DOMException && error.name === "AbortError" ? "AUDIO REPLACED" : "UNABLE TO DECODE AUDIO";
    statusText.textContent = "AUDIO ERROR";
    audioFile.value = "";
    updateClipControls();
    return;
  }

  clipMetadata = metadata;
  audioStatus.textContent = metadata.name ?? "AUDIO READY";
  sampleRateLabel.textContent = `${(metadata.sampleRate / 1000).toFixed(1)} kHz`;
  try {
    await mountSelectedSprite(metadata.sampleRate, "idle");
    statusText.textContent = "CLIP READY";
  } catch (error) {
    console.error(error);
    statusText.textContent = "AVATAR ERROR";
  } finally {
    audioFile.value = "";
    updateClipControls();
  }
}

async function playAudioClip() {
  if (!clipMetadata) return;
  if (stream) await stopMic();
  await mountSelectedSprite(clipMetadata.sampleRate, "speaking");
  await ensureClipPlayer().play();
  audioStatus.textContent = `PLAYING ${clipMetadata.name ?? "AUDIO"}`;
  statusText.textContent = "AUDIO LIVE";
  statusDot.classList.add("live");
  updateClipControls();
}

async function importAvatar(file: File) {
  uploadButton.disabled = true;
  avatarSelect.disabled = true;
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
      const state: CharacterState = stream ? "listening" : clipPlayer?.state === "playing" ? "speaking" : "idle";
      await mountSelectedSprite(audioContext?.sampleRate ?? clipMetadata?.sampleRate ?? 48000, state);
      previousAvatar?.dispose();
    } catch (error) {
      customAvatar = previousAvatar;
      nextAvatar.dispose();
      if (previousAvatar) customOption.textContent = `CUSTOM // ${previousAvatar.name.toUpperCase()}`;
      else customOption.remove();
      avatarSelect.value = previousAvatar ? "custom" : "niu-lai";
      const state: CharacterState = stream ? "listening" : clipPlayer?.state === "playing" ? "speaking" : "idle";
      await mountSelectedSprite(audioContext?.sampleRate ?? clipMetadata?.sampleRate ?? 48000, state);
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
    avatarFile.value = "";
  }
}

async function startMic() {
  stopAudioClip();
  statusText.textContent = "REQUESTING MIC";
  stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  audioContext = new AudioContext();
  await audioContext.resume();
  sampleRateLabel.textContent = `${(audioContext.sampleRate / 1000).toFixed(1)} kHz`;

  await mountSelectedSprite(audioContext.sampleRate, "listening");

  source = audioContext.createMediaStreamSource(stream);
  processor = audioContext.createScriptProcessor(1024, 1, 1);
  sink = audioContext.createGain();
  sink.gain.value = 0;
  processor.onaudioprocess = (event) => sprite?.pushPCM(event.inputBuffer.getChannelData(0));
  source.connect(processor);
  processor.connect(sink);
  sink.connect(audioContext.destination);

  micButton.classList.add("recording");
  buttonLabel.textContent = "STOP MIC";
  statusText.textContent = "MIC LIVE";
  statusDot.classList.add("live");
}

async function stopMic() {
  processor?.disconnect();
  source?.disconnect();
  sink?.disconnect();
  stream?.getTracks().forEach((track) => track.stop());
  await audioContext?.close();
  sprite?.destroy();
  processor = undefined; source = undefined; sink = undefined; stream = undefined; audioContext = undefined; sprite = undefined;
  updateMeter(0);
  mouthState.textContent = "CLOSED";
  stateHint.textContent = hints.closed;
  sampleRateLabel.textContent = "—";
  micButton.classList.remove("recording");
  buttonLabel.textContent = "START MIC";
  statusText.textContent = "STANDBY";
  statusDot.classList.remove("live");
  await mountSelectedSprite(clipMetadata?.sampleRate ?? 48000, "idle");
}

micButton.addEventListener("click", async () => {
  micButton.disabled = true;
  try {
    if (stream) await stopMic(); else await startMic();
  } catch (error) {
    console.error(error);
    statusText.textContent = "MIC BLOCKED";
    statusDot.classList.remove("live");
    buttonLabel.textContent = "TRY AGAIN";
  } finally {
    micButton.disabled = false;
  }
});

avatarSelect.addEventListener("change", async () => {
  avatarSelect.disabled = true;
  try {
    const state: CharacterState = stream ? "listening" : clipPlayer?.state === "playing" ? "speaking" : "idle";
    await mountSelectedSprite(audioContext?.sampleRate ?? clipMetadata?.sampleRate ?? 48000, state);
  } finally {
    avatarSelect.disabled = false;
  }
});

uploadButton.addEventListener("click", () => avatarFile.click());
avatarFile.addEventListener("change", () => {
  const file = avatarFile.files?.[0];
  if (file) void importAvatar(file);
});

audioChooseButton.addEventListener("click", () => audioFile.click());
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
  stream?.getTracks().forEach((track) => track.stop());
  void clipPlayer?.destroy();
  customAvatar?.dispose();
});

mountSelectedSprite(48000, "idle").catch(console.error);
updateClipControls();
