import { MouthState, MOUTH_STATES, CharacterState } from "../../src";
import type { Avatar } from "../../src";
import { canvasRenderer } from '../../src/canvas';
import type { SpriteCharacterDefinition } from '../../src/canvas';
import { loadSpriteCharacterPackage, type LoadedSpriteCharacterPackage } from "./characterPackage";
import { VoiceSession, type VoiceSessionState } from "./VoiceSession";
import { characterStateForVoiceSession } from './characterState';
import { CharacterStage } from './CharacterStage';
import { createStudioAudio, type ProviderName } from './StudioAudio';
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

let customModel: { bytes: ArrayBuffer; name: string } | undefined;
let blinkTimer: ReturnType<typeof setTimeout> | undefined;
let activeProvider: ProviderName = "mic";
let providerAbort = new AbortController();
let customAvatar: LoadedSpriteCharacterPackage | undefined;
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

function selectedAvatar(): { character?: string | SpriteCharacterDefinition; model?: string | ArrayBuffer; label: string; defaultText: string } {
  if (avatarSelect.value === 'mochi' || (avatarSelect.value === 'custom-model' && customModel)) {
    const imported = avatarSelect.value === 'custom-model' ? customModel : undefined;
    return { model: imported?.bytes ?? import.meta.env.BASE_URL + 'models/mochi/mochi.glb',
      label: imported?.name ?? 'Mochi', defaultText: "Hey, I'm Mochi. What's on your mind?" };
  }
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
  audio.setDefaultText(selectedAvatar().defaultText);
}

function syncCharacterChoices() {
  document.querySelector<HTMLElement>('#customModelButton')!.hidden = !customModel;
  document.querySelector('#customModelName')!.textContent = customModel?.name ?? 'Your model';
  customAvatarButton.hidden = !customAvatar;
  customAvatarName.textContent = customAvatar?.name ?? "Your character";
  for (const choice of characterChoices) {
    const selected = choice.dataset.avatar === avatarSelect.value;
    choice.classList.toggle("selected", selected);
    choice.setAttribute("aria-pressed", String(selected));
    choice.disabled = avatarSelect.disabled;
  }
}

const hints: Record<MouthState, string> = {
  [MouthState.Closed]: "waiting for signal",
  [MouthState.Small]: "soft articulation",
  [MouthState.Large]: "high energy",
  [MouthState.Wide]: "bright frequencies",
  [MouthState.Round]: "low vowel shape",
};
const mouthLabels: Record<MouthState, string> = {
  [MouthState.Closed]: 'Rest', [MouthState.Small]: 'Small', [MouthState.Large]: 'Open',
  [MouthState.Wide]: 'Wide', [MouthState.Round]: 'Round',
};
const mouthButtons = MOUTH_STATES.map((state) => {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.mouth = state; button.textContent = mouthLabels[state];
  button.setAttribute('aria-pressed', 'false');
  document.querySelector('#blinkPreview')!.before(button);
  return { state, button };
});

function updateMeter(energy: number) {
  const active = Math.round(energy * barElements.length);
  barElements.forEach((bar, index) => bar.classList.toggle("active", index < active));
  bars.setAttribute("aria-valuenow", Math.round(energy * 100).toString());
  const db = energy > 0 ? 20 * Math.log10(Math.max(energy * 0.28, 0.0001)) : -Infinity;
  dbValue.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : "−∞ dB";
}

function showAvatar(next: Avatar) {
  clearTimeout(blinkTimer);
  document.querySelector('#blinkPreview')!.setAttribute('aria-pressed', 'false');
  stageWrap.dataset.loaded = 'true';
  document.querySelector<HTMLElement>('#modelTools')!.hidden = false;
  document.querySelector<HTMLElement>('#viewHint')!.textContent = next.capabilities.viewControl
    ? 'Drag to orbit, scroll to zoom' : 'Preview expressions';
  document.querySelector<HTMLElement>('#resetView')!.hidden = !next.capabilities.viewControl;
  for (const { state, button } of mouthButtons) {
    button.disabled = !next.capabilities.mouth.includes(state);
    button.setAttribute('aria-pressed', 'false');
  }
  document.querySelector<HTMLButtonElement>('#blinkPreview')!.disabled = !next.capabilities.blink;
  next.onMotion((frame) => {
    mouthState.textContent = frame.mouth.toUpperCase();
    stateHint.textContent = hints[frame.mouth];
    updateMeter(frame.energy);
  });
}

const stage = new CharacterStage(canvas, showAvatar, (error) => { uploadStatus.textContent = error.message; });
async function mountSelectedAvatar(sampleRate: number, state: CharacterState, signal: AbortSignal = providerAbort.signal) {
  const selected = selectedAvatar();
  const key = selected.model ?? selected.character;
  stageLabel.textContent = selected.label;
  stageWrap.dataset.character = avatarSelect.value;
  stageWrap.dataset.renderer = selected.model ? '3d' : '2d';
  syncCharacterChoices();
  const ready = stage.ensure(key, async () => selected.model
    ? (await import('../../src/three')).threeRenderer({ model: selected.model, background: null })
    : canvasRenderer({ character: selected.character! }), sampleRate, state, signal);
  if (stage.isLoading) stageWrap.dataset.loaded = 'false';
  await ready;
}

function reportError(error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  console.error(error);
}

async function importAvatar(file: File) {
  if (avatarSelect.disabled) return;
  if (file.name.toLowerCase().endsWith('.glb')) { await importModel(file); return; }
  uploadButton.disabled = true;
  avatarSelect.disabled = true;
  syncCharacterChoices();
  uploadStatus.classList.remove("error", "success");
  uploadStatus.textContent = `Opening ${file.name}…`;
  let nextAvatar: LoadedSpriteCharacterPackage | undefined;
  try {
    nextAvatar = await loadSpriteCharacterPackage(file);
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
      const state = audio.state;
      await mountSelectedAvatar(currentSampleRate(), state);
      syncDefaultTTSText();
      previousAvatar?.dispose();
    } catch (error) {
      customAvatar = previousAvatar;
      nextAvatar.dispose();
      if (previousAvatar) customOption.textContent = `CUSTOM // ${previousAvatar.name.toUpperCase()}`;
      else customOption.remove();
      avatarSelect.value = previousAvatar ? "custom" : "niu-lai";
      const state = audio.state;
      await mountSelectedAvatar(currentSampleRate(), state);
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

async function importModel(file: File) {
  if (file.size > 25 * 1024 * 1024) { uploadStatus.textContent = 'Choose a GLB smaller than 25 MB.'; return; }
  const previous = customModel;
  const previousSelection = avatarSelect.value;
  avatarSelect.disabled = true; uploadButton.disabled = true; syncCharacterChoices();
  try {
    customModel = { bytes: await file.arrayBuffer(), name: file.name.replace(/\.glb$/i, '') };
    let option = avatarSelect.querySelector<HTMLOptionElement>('option[value="custom-model"]');
    if (!option) { option = new Option('Your 3D model', 'custom-model'); avatarSelect.add(option); }
    avatarSelect.value = 'custom-model';
    await mountSelectedAvatar(currentSampleRate(), stage.avatar?.getState() ?? CharacterState.Idle);
    syncDefaultTTSText();
    uploadStatus.textContent = customModel.name + ' loaded locally';
    uploadStatus.classList.remove('error');
  } catch (error) {
    customModel = previous; avatarSelect.value = previousSelection;
    if (!previous) avatarSelect.querySelector('option[value="custom-model"]')?.remove();
    await mountSelectedAvatar(currentSampleRate(), CharacterState.Idle);
    uploadStatus.textContent = error instanceof Error ? error.message : 'Unable to load this GLB.';
    uploadStatus.classList.add('error');
  } finally { avatarSelect.disabled = false; uploadButton.disabled = false; avatarFile.value = ''; syncCharacterChoices(); }
}

const audio = createStudioAudio({ stage, provider: () => activeProvider, mountSelectedAvatar,
  statusText, statusDot, sampleRateLabel, demoSampleButton });

function voiceAgentUrl(): string {
  if (configuredVoiceAgentUrl) return configuredVoiceAgentUrl;
  const url = new URL("/voice-agent", window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

const voiceSession = new VoiceSession({
  gatewayUrl: voiceAgentUrl(),
  healthUrl: localVoiceAgentAvailable && !configuredVoiceAgentUrl ? "/voice-agent/healthz" : undefined,
  onPCM: (chunk) => { if (activeProvider === "agent") stage.avatar?.pushPCM(chunk); },
  onReset: () => { if (activeProvider === "agent") stage.resetAudio(); },
  onTranscript: (text) => { agentTranscript.textContent = text; },
  onReady: async (sampleRate, signal) => {
    await mountSelectedAvatar(sampleRate, CharacterState.Listening, signal);
    if (!signal.aborted) sampleRateLabel.textContent = `${(sampleRate / 1000).toFixed(1)} kHz`;
  },
  onState: (state, error) => {
    updateVoiceAgentControls(state);
    agentStatus.textContent = error?.message ?? state.toUpperCase();
    if (activeProvider !== "agent") return;
    statusText.textContent = `AGENT ${state.toUpperCase()}`;
    const live = state === "listening" || state === "thinking" || state === "speaking";
    statusDot.classList.toggle("live", live);
    stage.setState(characterStateForVoiceSession(state));
    if (!live) stage.resetAudio();
  },
});

function currentSampleRate(): number {
  if (activeProvider === 'agent') return voiceSession.sampleRate ?? 48_000;
  return audio.sampleRate;
}

function updateVoiceAgentControls(state: VoiceSessionState = voiceSession.state) {
  const live = state === "listening" || state === "thinking" || state === "speaking";
  agentConnectButton.disabled = state === "connecting" || state === "stopping" || live;
  agentConnectButton.textContent = state === "error" ? "Retry connection" : "Start conversation";
  agentInterruptButton.disabled = !live;
  agentDisconnectButton.disabled = state !== "connecting" && !live;
}



function selectProvider(provider: ProviderName) {
  if (provider === activeProvider || (provider === "agent" && !voiceAgentAvailable)) return;
  activeProvider = provider;
  providerAbort.abort();
  providerAbort = new AbortController();
  // Invalidate old work synchronously before any awaited teardown finishes.
  if (provider !== "agent") void voiceSession.stop();
  audio.selectProvider(provider);
  stage.resetAudio();
  stage.setState(CharacterState.Idle);
  void mountSelectedAvatar(currentSampleRate(), CharacterState.Idle).catch(reportError);
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

avatarSelect.addEventListener("change", async () => {
  avatarSelect.disabled = true;
  uploadButton.disabled = true;
  syncCharacterChoices();
  try {
    const state = activeProvider === 'agent' ? characterStateForVoiceSession(voiceSession.state)
      : audio.state;
    await mountSelectedAvatar(currentSampleRate(), state);
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
  void audio.playSample();
});

uploadButton.addEventListener("click", () => avatarFile.click());
avatarFile.addEventListener("change", () => {
  const file = avatarFile.files?.[0];
  if (file) void importAvatar(file);
});

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
  clearTimeout(blinkTimer); stage.dispose();
  audio.dispose();
  void voiceSession.stop();
  customAvatar?.dispose();
});

document.querySelector('#resetView')!.addEventListener('click', () => stage.avatar?.resetView());
for (const { state, button } of mouthButtons) {
  button.addEventListener('click', () => {
    const selected = button.getAttribute('aria-pressed') !== 'true';
    stage.avatar?.previewMouth(selected ? state : undefined);
    for (const { button: other } of mouthButtons) other.setAttribute('aria-pressed', String(other === button && selected));
  });
}
document.querySelector('#blinkPreview')!.addEventListener('click', () => {
  clearTimeout(blinkTimer); stage.avatar?.previewBlink(true);
  document.querySelector('#blinkPreview')!.setAttribute('aria-pressed', 'true');
  blinkTimer = setTimeout(() => { stage.avatar?.previewBlink(false); document.querySelector('#blinkPreview')!.setAttribute('aria-pressed', 'false'); }, 250);
});

if (new URLSearchParams(location.search).get('character') === 'mochi') avatarSelect.value = 'mochi';

mountSelectedAvatar(48000, CharacterState.Idle).catch(reportError);
updateVoiceAgentControls();
if (!voiceAgentAvailable && voiceAgentTab) {
  voiceAgentTab.disabled = true;
  voiceAgentTab.setAttribute("aria-disabled", "true");
  const description = voiceAgentTab.querySelector("small");
  if (description) description.textContent = "Gateway not configured";
}
