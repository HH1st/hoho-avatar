import { element } from './studioDom';

/** Shared stage readouts. Feature state never needs to be read back from the DOM. */
export class StudioStatus {
  private readonly text = element('#statusText');
  private readonly dot = element('#statusDot');
  private readonly sampleRate = element('#sampleRate');

  show(text: string, live = false): void {
    this.text.textContent = text;
    this.dot.classList.toggle('live', live);
  }

  showSampleRate(rate: number): void {
    this.sampleRate.textContent = `${(rate / 1000).toFixed(1)} kHz`;
  }
}
