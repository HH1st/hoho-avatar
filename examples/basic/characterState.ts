import { CharacterState } from '../../src';
import type { VoiceSessionState } from './VoiceSession';

/** Session lifecycle belongs to the voice adapter, not the renderer's vocabulary. */
const voiceCharacterStates: Readonly<Record<VoiceSessionState, CharacterState>> = {
  disconnected: CharacterState.Idle,
  connecting: CharacterState.Idle,
  listening: CharacterState.Listening,
  thinking: CharacterState.Thinking,
  speaking: CharacterState.Speaking,
  stopping: CharacterState.Idle,
  error: CharacterState.Idle,
};

export function characterStateForVoiceSession(state: VoiceSessionState): CharacterState {
  return voiceCharacterStates[state];
}
