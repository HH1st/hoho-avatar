import { waitFor } from '../../internal/abort';

let loading: Promise<void> | undefined;
let source: string | undefined;
const available = () => typeof window !== 'undefined' && Boolean((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore);

/** Loads a caller-owned Cubism Core script. No default CDN or bundled proprietary code. */
export async function loadCubismCore(url: string | undefined, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (available()) return;
  if (!url) throw new Error('Provide coreUrl or load Live2DCubismCore before selecting a Live2D model.');
  const resolved = new URL(url, document.baseURI);
  if (!['https:', 'http:'].includes(resolved.protocol)) throw new Error('Cubism Core URL must use HTTP(S).');
  if (loading && source !== resolved.href) throw new Error('A different Cubism Core is already loading.');
  if (!loading) {
    source = resolved.href;
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = resolved.href; script.async = true;
      const timer = setTimeout(() => finish(new Error('Cubism Core loading timed out.')), 30_000);
      const finish = (error?: Error) => {
        clearTimeout(timer); script.onload = null; script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      script.onload = () => finish(available() ? undefined : new Error('The script did not initialize Live2DCubismCore.'));
      script.onerror = () => finish(new Error('Unable to load Cubism Core. Check its URL and Content Security Policy.'));
      document.head.append(script);
    }).catch((error) => { loading = undefined; source = undefined; throw error; });
  }
  // The script is shared by renderers; cancelling one consumer must not cancel another.
  await waitFor(loading, signal);
}
