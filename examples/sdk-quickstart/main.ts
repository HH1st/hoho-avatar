import { createAvatar } from "@hh1st/hoho-avatar";
import pixelBot from "@hh1st/hoho-avatar/characters/pixel-bot";

const canvas = document.querySelector<HTMLCanvasElement>("#avatar")!;
const status = document.querySelector<HTMLElement>("#status")!;
const frames = document.querySelector<HTMLElement>("#frames")!;
const buttons = document.querySelectorAll<HTMLButtonElement>("button");
let count = 0;

async function main() {
  const avatar = await createAvatar(canvas, {
    character: pixelBot,
    onMotion: () => { frames.textContent = String(++count); },
  });
  status.textContent = "Ready";
  buttons.forEach((button) => { button.disabled = false; });
  const report = (error: unknown) => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    status.textContent = error instanceof Error ? error.message : "Audio failed";
  };
  document.querySelector("#mic")!.addEventListener("click", () => {
    void avatar.startMicrophone().then(() => { status.textContent = "Listening"; }).catch(report);
  });
  document.querySelector("#play")!.addEventListener("click", () => {
    // Put a browser-decodable sample.wav in public/ when using Vite.
    void avatar.playAudio("./sample.wav").then(() => { status.textContent = "Playing"; }).catch(report);
  });
  document.querySelector("#stop")!.addEventListener("click", () => {
    avatar.stopAudio();
    status.textContent = "Stopped";
  });
  document.querySelector("#destroy")!.addEventListener("click", () => {
    void avatar.destroy().then(() => {
      status.textContent = "Destroyed";
      buttons.forEach((button) => { button.disabled = true; });
    });
  });
  window.addEventListener("pagehide", () => { void avatar.destroy(); });
}
void main().catch((error: Error) => { status.textContent = error.message; });
