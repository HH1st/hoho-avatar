import { CharacterState } from '../../src';
import { createMicrophoneControls } from './MicrophoneControls';
import { createClipControls } from './ClipControls';
import { createTTSControls } from './TTSControls';
import type { AudioControlContext, ProviderName } from './studioTypes';

/** Coordinates local sources; each source owns its player and panel controls. */
export function createStudioAudio(context: AudioControlContext) {
  const microphone = createMicrophoneControls(context);
  const clip = createClipControls(context, () => tts.stop());
  const tts = createTTSControls(context, () => clip.stop(), () => clip.loaded);

  return {
    playSample: clip.playSample,
    get state(): CharacterState {
      if (microphone.active) return CharacterState.Listening;
      return clip.playing || tts.playing ? CharacterState.Speaking : CharacterState.Idle;
    },
    get sampleRate(): number {
      return context.provider() === 'tts' ? tts.sampleRate : microphone.sampleRate ?? clip.sampleRate ?? 48_000;
    },
    setDefaultText: tts.setDefaultText,
    selectProvider(next: ProviderName) {
      if (next !== 'mic') void microphone.stop();
      if (next !== 'file') clip.clear();
      if (next !== 'tts') tts.stop();
    },
    dispose() { microphone.dispose(); clip.dispose(); tts.dispose(); },
  };
}
