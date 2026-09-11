import { CharacterState } from '../../src';
import { CharacterStage } from './CharacterStage';
import { CharacterLibrary } from './CharacterLibrary';
import { StageView } from './StageView';
import { StudioStatus } from './StudioStatus';
import { ProviderTabs } from './ProviderTabs';
import { VoiceAgentControls } from './VoiceAgentControls';
import { createStudioAudio } from './StudioAudio';
import { voiceAgentConfig } from './studioConfig';
import { element } from './studioDom';
import type { AudioControlContext, ProviderName } from './studioTypes';

function reportError(error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') return;
  console.error(error);
}

/** Composition root: wires features and owns cross-provider transitions. */
export class Studio {
  private provider: ProviderName = 'file';
  private providerAbort = new AbortController();
  private readonly events = new AbortController();
  private readonly status = new StudioStatus();
  private readonly view = new StageView();
  private readonly stage: CharacterStage;
  private readonly characters: CharacterLibrary;
  private readonly audio: ReturnType<typeof createStudioAudio>;
  private readonly agent: VoiceAgentControls;
  private readonly tabs: ProviderTabs;

  constructor() {
    const uploadStatus = element('#uploadStatus');
    this.stage = new CharacterStage(element<HTMLCanvasElement>('#avatar'),
      (avatar) => this.view.show(avatar, this.characters.selected.renderer === 'live2d'),
      (error) => { uploadStatus.textContent = error.message; });
    this.characters = new CharacterLibrary({
      stage: this.stage,
      currentAudio: () => this.currentAudio,
      signal: () => this.providerAbort.signal,
      onSelected: (character) => this.audio.setDefaultText(character.defaultText),
    });
    const context: AudioControlContext = {
      stage: this.stage,
      provider: () => this.provider,
      mountSelectedAvatar: (rate, state, signal) => this.characters.mount(rate, state, signal),
      status: this.status,
    };
    this.audio = createStudioAudio(context);
    this.agent = new VoiceAgentControls(context, () => this.characters.selected.label);
    this.tabs = new ProviderTabs(voiceAgentConfig.available, (provider) => this.selectProvider(provider));
    element('#demoSampleButton').addEventListener('click', () => {
      this.selectProvider('file');
      if (window.matchMedia('(max-width: 850px)').matches) {
        element('.provider-section').scrollIntoView({ block: 'start', behavior: 'instant' });
      }
      void this.audio.playSample();
    }, { signal: this.events.signal });
    window.addEventListener('beforeunload', () => this.dispose(), { signal: this.events.signal });
    void this.characters.mount(48_000, CharacterState.Idle).catch(reportError);
  }

  private get currentAudio(): { sampleRate: number; state: CharacterState } {
    const source = this.provider === 'agent' ? this.agent : this.audio;
    return { sampleRate: source.sampleRate, state: source.state };
  }

  private selectProvider(provider: ProviderName): void {
    if (provider === this.provider || (provider === 'agent' && !voiceAgentConfig.available)) return;
    this.provider = provider;
    this.providerAbort.abort();
    this.providerAbort = new AbortController();
    // Invalidate old work synchronously before asynchronous teardown completes.
    if (provider !== 'agent') void this.agent.stop();
    this.audio.selectProvider(provider);
    this.stage.resetAudio();
    this.stage.setState(CharacterState.Idle);
    void this.characters.mount(this.currentAudio.sampleRate, CharacterState.Idle).catch(reportError);
    this.status.show('STANDBY');
    this.tabs.show(provider);
  }

  dispose(): void {
    this.events.abort();
    this.providerAbort.abort();
    this.view.dispose();
    this.stage.dispose();
    this.audio.dispose();
    this.agent.dispose();
    this.characters.dispose();
    this.tabs.dispose();
  }
}
