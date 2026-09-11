import type { CharacterState } from '../../src';
import type { CharacterStage } from './CharacterStage';
import type { StudioStatus } from './StudioStatus';

export type ProviderName = 'mic' | 'file' | 'tts' | 'agent';

export interface AudioControlContext {
  stage: CharacterStage;
  provider(): ProviderName;
  mountSelectedAvatar(rate: number, state: CharacterState, signal?: AbortSignal): Promise<void>;
  status: StudioStatus;
}
