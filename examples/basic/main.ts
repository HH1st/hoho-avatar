import { TalkingSprite } from "../../src";
import type { CharacterDefinition } from "../../src";
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

const avatars = {
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
  return avatars[avatarSelect.value as keyof typeof avatars] ?? avatars["pixel-bot"];
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
  const db = energy > 0 ? 20 * Math.log10(Math.max(energy * 0.28, 0.0001)) : -Infinity;
  dbValue.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "−∞ dB";
}

async function mountSelectedSprite(sampleRate: number, state: "idle" | "listening") {
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
      await mountSelectedSprite(audioContext?.sampleRate ?? 48000, stream ? "listening" : "idle");
      previousAvatar?.dispose();
    } catch (error) {
      customAvatar = previousAvatar;
      nextAvatar.dispose();
      if (previousAvatar) customOption.textContent = `CUSTOM // ${previousAvatar.name.toUpperCase()}`;
      else customOption.remove();
      avatarSelect.value = previousAvatar ? "custom" : "pixel-bot";
      await mountSelectedSprite(audioContext?.sampleRate ?? 48000, stream ? "listening" : "idle");
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
  await mountSelectedSprite(48000, "idle");
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
    await mountSelectedSprite(audioContext?.sampleRate ?? 48000, stream ? "listening" : "idle");
  } finally {
    avatarSelect.disabled = false;
  }
});

uploadButton.addEventListener("click", () => avatarFile.click());
avatarFile.addEventListener("change", () => {
  const file = avatarFile.files?.[0];
  if (file) void importAvatar(file);
});

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

window.addEventListener("beforeunload", () => customAvatar?.dispose());

mountSelectedSprite(48000, "idle").catch(console.error);
