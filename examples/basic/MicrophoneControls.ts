import { MicrophoneInput, CharacterState } from '../../src';
import { element } from './studioDom';
import type { AudioControlContext } from './studioTypes';

export function createMicrophoneControls(context: AudioControlContext) {
  const { stage, provider, mountSelectedAvatar, status } = context;
  const micButton = element<HTMLButtonElement>("#micButton");
  const buttonLabel = element("#buttonLabel");
  let microphone: MicrophoneInput | undefined;
  let micAbort: AbortController | undefined;
  const events = new AbortController();

  async function startMic() {
    if (microphone || provider() !== "mic") return;
    const capture = new MicrophoneInput((chunk) => {
      if (microphone === capture && provider() === "mic") stage.avatar?.pushPCM(chunk);
    });
    const abort = new AbortController();
    microphone = capture;
    micAbort = abort;
    buttonLabel.textContent = "Cancel microphone";
    status.show("REQUESTING MIC");
    try {
      await capture.prepare();
      await capture.start(abort.signal);
      if (microphone !== capture) return;
      await mountSelectedAvatar(capture.sampleRate, CharacterState.Listening, abort.signal);
      if (microphone !== capture) return;
      status.showSampleRate(capture.sampleRate);
      micButton.classList.add("recording");
      buttonLabel.textContent = "Stop microphone";
      status.show("MIC LIVE", true);
    } catch {
      if (microphone !== capture) return;
      await stopMic();
      if (provider() === "mic") {
        status.show("MIC BLOCKED");
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
      status.show("STANDBY");
    }
    return capture?.destroy() ?? Promise.resolve();
  }

  micButton.addEventListener('click', () => {
    if (microphone) void stopMic(); else void startMic();
  }, { signal: events.signal });

  return {
    get active() { return Boolean(microphone); },
    get sampleRate() { return microphone?.sampleRate; },
    stop: stopMic,
    dispose() { events.abort(); micAbort?.abort(); void microphone?.destroy(); },
  };
}
