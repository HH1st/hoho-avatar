import { CharacterState } from '../../src';
import { VoiceSession } from './VoiceSession';
import type { VoiceSessionState } from './VoiceSession';
import { characterStateForVoiceSession } from './characterState';
import { voiceAgentConfig } from './studioConfig';
import { element } from './studioDom';
import type { AudioControlContext } from './studioTypes';

function isLive(state: VoiceSessionState): boolean {
  return state === 'listening' || state === 'thinking' || state === 'speaking';
}

/** Adapts the voice session to its panel and the shared avatar stage. */
export class VoiceAgentControls {
  private readonly status = element('#agentStatus');
  private readonly transcript = element('#agentTranscript');
  private readonly connect = element<HTMLButtonElement>('#agentConnectButton');
  private readonly interrupt = element<HTMLButtonElement>('#agentInterruptButton');
  private readonly disconnect = element<HTMLButtonElement>('#agentDisconnectButton');
  private readonly events = new AbortController();
  private readonly session: VoiceSession;

  constructor(context: AudioControlContext, characterName: () => string) {
    const { stage, provider, mountSelectedAvatar, status } = context;
    this.session = new VoiceSession({
      gatewayUrl: voiceAgentConfig.gatewayUrl,
      healthUrl: voiceAgentConfig.healthUrl,
      onPCM: (chunk) => { if (provider() === 'agent') stage.avatar?.pushPCM(chunk); },
      onReset: () => { if (provider() === 'agent') stage.resetAudio(); },
      onTranscript: (text) => { this.transcript.textContent = text; },
      onReady: async (sampleRate, signal) => {
        await mountSelectedAvatar(sampleRate, CharacterState.Listening, signal);
        if (!signal.aborted) status.showSampleRate(sampleRate);
      },
      onState: (state, error) => {
        this.updateControls(state);
        this.status.textContent = error?.message ?? state.toUpperCase();
        if (provider() !== 'agent') return;
        const live = isLive(state);
        status.show(`AGENT ${state.toUpperCase()}`, live);
        stage.setState(characterStateForVoiceSession(state));
        if (!live) stage.resetAudio();
      },
    });
    const options = { signal: this.events.signal };
    this.connect.addEventListener('click', () => {
      if (provider() !== 'agent') return;
      void this.session.start({
        voice: 'cedar',
        instructions: `You are ${characterName()}, a warm and concise voice companion. Keep spoken responses short and natural.`,
      });
    }, options);
    this.interrupt.addEventListener('click', () => this.session.interrupt(), options);
    this.disconnect.addEventListener('click', () => void this.session.stop(), options);
    this.updateControls(this.session.state);
  }

  get state(): CharacterState { return characterStateForVoiceSession(this.session.state); }
  get sampleRate(): number { return this.session.sampleRate ?? 48_000; }
  stop(): Promise<void> { return this.session.stop(); }

  private updateControls(state: VoiceSessionState): void {
    const live = isLive(state);
    this.connect.disabled = state === 'connecting' || state === 'stopping' || live;
    this.connect.textContent = state === 'error' ? 'Retry connection' : 'Start conversation';
    this.interrupt.disabled = !live;
    this.disconnect.disabled = state !== 'connecting' && !live;
  }

  dispose(): void { this.events.abort(); void this.session.stop(); }
}
