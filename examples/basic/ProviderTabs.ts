import { element } from './studioDom';
import type { ProviderName } from './studioTypes';

function providerName(value: string | undefined): ProviderName {
  if (value === 'mic' || value === 'file' || value === 'tts' || value === 'agent') return value;
  throw new Error(`Unknown audio provider: ${value}`);
}

/** Tab presentation and keyboard navigation; session transitions belong to Studio. */
export class ProviderTabs {
  private readonly tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.provider-tab'));
  private readonly panels = document.querySelectorAll<HTMLElement>('.provider-panel');
  private readonly privacy = element('#privacyNotice');
  private readonly events = new AbortController();

  constructor(voiceAgentAvailable: boolean, select: (provider: ProviderName) => void) {
    for (const tab of this.tabs) {
      if (tab.dataset.provider === 'agent' && !voiceAgentAvailable) {
        tab.disabled = true;
        tab.setAttribute('aria-disabled', 'true');
        const description = tab.querySelector('small');
        if (description) description.textContent = 'Gateway not configured';
      }
      tab.addEventListener('click', () => select(providerName(tab.dataset.provider)), { signal: this.events.signal });
      tab.addEventListener('keydown', (event) => {
        const available = this.tabs.filter((item) => !item.disabled);
        const index = available.indexOf(tab);
        let next: HTMLButtonElement | undefined;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = available[(index + 1) % available.length];
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = available[(index - 1 + available.length) % available.length];
        if (event.key === 'Home') next = available[0];
        if (event.key === 'End') next = available.at(-1);
        if (!next) return;
        event.preventDefault();
        select(providerName(next.dataset.provider));
        next.focus();
      }, { signal: this.events.signal });
    }
  }

  show(provider: ProviderName): void {
    for (const tab of this.tabs) {
      const active = tab.dataset.provider === provider;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const panel of this.panels) {
      const active = panel.dataset.providerPanel === provider;
      panel.classList.toggle('active', active);
      panel.hidden = !active;
    }
    this.privacy.textContent = provider === 'agent'
      ? 'Voice conversations send microphone audio to Azure OpenAI.'
      : 'Just between you and your browser. Audio stays here.';
  }

  dispose(): void { this.events.abort(); }
}
