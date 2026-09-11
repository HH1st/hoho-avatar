import { CharacterState } from '../../src';
import type { CharacterStage } from './CharacterStage';
import { createCharacterCatalog, createCharacterRenderer } from './characterCatalog';
import type { StudioCharacter } from './characterCatalog';
import { loadSpriteCharacterPackage } from './characterPackage';
import type { LoadedSpriteCharacterPackage } from './characterPackage';
import { live2dConfig } from './studioConfig';
import { element } from './studioDom';
import wankoromochiPreview from './assets/wankoromochi-preview.png';

interface CharacterLibraryOptions {
  stage: CharacterStage;
  currentAudio(): { sampleRate: number; state: CharacterState };
  signal(): AbortSignal;
  onSelected(character: StudioCharacter): void;
}

/** Owns selection and imported resources. The hidden select only mirrors this state. */
export class CharacterLibrary {
  private readonly catalog = createCharacterCatalog();
  private readonly select = element<HTMLSelectElement>('#avatarSelect');
  private readonly choices = Array.from(document.querySelectorAll<HTMLButtonElement>('.character-choice'));
  private readonly upload = element<HTMLButtonElement>('#uploadButton');
  private readonly file = element<HTMLInputElement>('#avatarFile');
  private readonly status = element('#uploadStatus');
  private readonly wrap = element('.stage-wrap');
  private readonly label = element('#stageLabel');
  private readonly credit = element('#live2dCredit');
  private readonly customModelButton = element<HTMLButtonElement>('#customModelButton');
  private readonly customModelName = element('#customModelName');
  private readonly customAvatarButton = element<HTMLButtonElement>('#customAvatarButton');
  private readonly customAvatarName = element('#customAvatarName');
  private readonly events = new AbortController();
  private selectedId = 'niu-lai';
  private busy = false;
  private customAvatar?: LoadedSpriteCharacterPackage;

  constructor(private readonly options: CharacterLibraryOptions) {
    const requested = new URLSearchParams(location.search).get('character');
    if ((requested === 'mochi' || requested === 'live2d') && this.catalog.has(requested)) this.selectedId = requested;
    const live2dButton = element<HTMLButtonElement>('[data-avatar="live2d"]');
    live2dButton.hidden = !live2dConfig.modelUrl;
    if (live2dConfig.usesSample) {
      const preview = element<HTMLImageElement>('#live2dPreview');
      preview.src = wankoromochiPreview;
      preview.hidden = false;
      element<SVGElement>('#live2dPreviewFallback').style.display = 'none';
    }
    element('#live2dName').textContent = live2dConfig.name;
    const events = { signal: this.events.signal };
    this.select.addEventListener('change', () => void this.choose(this.select.value), events);
    for (const choice of this.choices) {
      choice.addEventListener('click', () => void this.choose(choice.dataset.avatar ?? ''), events);
    }
    this.upload.addEventListener('click', () => this.file.click(), events);
    this.file.addEventListener('change', () => {
      const file = this.file.files?.[0];
      if (file) void this.importFile(file);
    }, events);
    for (const name of ['dragenter', 'dragover', 'dragleave', 'drop']) {
      this.wrap.addEventListener(name, (event) => {
        event.preventDefault();
        this.wrap.classList.toggle('dragging', name === 'dragenter' || name === 'dragover');
      }, events);
    }
    this.wrap.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files[0];
      if (file) void this.importFile(file);
    }, events);
    this.syncChoices();
  }

  get selected(): StudioCharacter { return this.catalog.get(this.selectedId)!; }

  async mount(sampleRate: number, state: CharacterState, signal = this.options.signal()): Promise<void> {
    const selected = this.selected;
    this.label.textContent = selected.label;
    this.wrap.dataset.character = selected.id;
    this.wrap.dataset.renderer = selected.renderer;
    this.credit.hidden = !live2dConfig.usesSample;
    this.syncChoices();
    const ready = this.options.stage.ensure(selected.source, () => createCharacterRenderer(selected), sampleRate, state, signal);
    if (this.options.stage.isLoading) this.wrap.dataset.loaded = 'false';
    await ready;
  }

  private async mountCurrentAudio(): Promise<void> {
    const { sampleRate, state } = this.options.currentAudio();
    await this.mount(sampleRate, state);
  }

  private async choose(id: string): Promise<void> {
    if (this.busy || id === this.selectedId || !this.catalog.has(id)) return;
    this.selectedId = id;
    this.setBusy(true);
    try {
      await this.mountCurrentAudio();
      this.options.onSelected(this.selected);
    } catch (error) {
      this.showError(error, 'Unable to load this character.');
    } finally { this.setBusy(false); }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.select.disabled = busy;
    this.upload.disabled = busy;
    this.syncChoices();
  }

  private syncChoices(): void {
    this.select.value = this.selectedId;
    this.customModelButton.hidden = !this.catalog.has('custom-model');
    this.customModelName.textContent = this.catalog.get('custom-model')?.label ?? 'Your model';
    this.customAvatarButton.hidden = !this.customAvatar;
    this.customAvatarName.textContent = this.customAvatar?.name ?? 'Your character';
    for (const choice of this.choices) {
      const selected = choice.dataset.avatar === this.selectedId;
      choice.classList.toggle('selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
      choice.disabled = this.busy;
    }
  }

  private setCustomOption(id: string, label: string): void {
    let option = this.select.querySelector<HTMLOptionElement>(`option[value="${id}"]`);
    if (!option) {
      option = new Option(label, id);
      this.select.add(option);
    }
    option.textContent = label;
  }

  private showError(error: unknown, fallback: string): void {
    this.status.textContent = error instanceof Error ? error.message : fallback;
    this.status.classList.add('error');
  }

  private async importFile(file: File): Promise<void> {
    if (this.busy) return;
    if (file.name.toLowerCase().endsWith('.glb')) { await this.importModel(file); return; }
    this.setBusy(true);
    this.status.classList.remove('error', 'success');
    this.status.textContent = `Opening ${file.name}…`;
    try {
      const next = await loadSpriteCharacterPackage(file);
      const previous = this.customAvatar;
      const previousEntry = this.catalog.get('custom');
      this.customAvatar = next;
      this.catalog.set('custom', { id: 'custom', renderer: '2d', source: next.definition, label: next.name,
        defaultText: `Hey, I'm ${next.name}. How's your day so far?` });
      this.setCustomOption('custom', `CUSTOM // ${next.name.toUpperCase()}`);
      this.selectedId = 'custom';
      try {
        await this.mountCurrentAudio();
        this.options.onSelected(this.selected);
        previous?.dispose();
      } catch (error) {
        this.customAvatar = previous;
        next.dispose();
        if (previousEntry) {
          this.catalog.set('custom', previousEntry);
          this.setCustomOption('custom', `CUSTOM // ${previousEntry.label.toUpperCase()}`);
        } else {
          this.catalog.delete('custom');
          this.select.querySelector('option[value="custom"]')?.remove();
        }
        this.selectedId = previous ? 'custom' : 'niu-lai';
        await this.mountCurrentAudio();
        throw error;
      }
      this.status.textContent = `${next.name} loaded locally`;
      this.status.classList.add('success');
    } catch (error) {
      console.error(error);
      this.showError(error, 'Unable to load this character ZIP.');
    } finally { this.setBusy(false); this.file.value = ''; }
  }

  private async importModel(file: File): Promise<void> {
    if (file.size > 25 * 1024 * 1024) { this.status.textContent = 'Choose a GLB smaller than 25 MB.'; return; }
    const previous = this.catalog.get('custom-model');
    const previousSelection = this.selectedId;
    this.setBusy(true);
    try {
      const name = file.name.replace(/\.glb$/i, '');
      this.catalog.set('custom-model', { id: 'custom-model', renderer: '3d', source: await file.arrayBuffer(),
        label: name, defaultText: "Hey, I'm Mochi. What's on your mind?" });
      this.setCustomOption('custom-model', 'Your 3D model');
      this.selectedId = 'custom-model';
      await this.mountCurrentAudio();
      this.options.onSelected(this.selected);
      this.status.textContent = name + ' loaded locally';
      this.status.classList.remove('error');
    } catch (error) {
      this.selectedId = previousSelection;
      if (previous) this.catalog.set('custom-model', previous);
      else {
        this.catalog.delete('custom-model');
        this.select.querySelector('option[value="custom-model"]')?.remove();
      }
      await this.mount(this.options.currentAudio().sampleRate, CharacterState.Idle);
      this.showError(error, 'Unable to load this GLB.');
    } finally { this.setBusy(false); this.file.value = ''; }
  }

  dispose(): void {
    this.events.abort();
    this.customAvatar?.dispose();
  }
}
