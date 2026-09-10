import { waitFor } from '../../internal/abort';

interface ModelReferences { Moc: string; Textures: string[]; Physics?: string; Pose?: string; }
export interface Live2DModelSettings {
  Version: 3;
  FileReferences: ModelReferences;
}
export interface Live2DAssets { settings: Live2DModelSettings & { url: string }; dispose(): void; }

/** Prefetch owned model assets with AbortSignal; Pixi reads only unique local blob URLs. */
export async function loadLive2DAssets(modelUrl: string, signal: AbortSignal): Promise<Live2DAssets> {
  const url = new URL(modelUrl, document.baseURI);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Live2D model URL must use HTTP(S).');
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Unable to load Live2D model: ' + response.status);
  const raw = await response.json();
  const refs = raw?.FileReferences;
  if (raw?.Version !== 3 || typeof refs?.Moc !== 'string' || !Array.isArray(refs?.Textures) || !refs.Textures.length
    || !refs.Textures.every((path: unknown) => typeof path === 'string')) throw new Error('Choose a Cubism 3/4 .model3.json with a moc3 and textures.');
  if (refs.Textures.length > 16) throw new Error('Live2D models may contain at most 16 textures.');
  const urls: string[] = [];
  const dispose = () => { for (const objectUrl of urls.splice(0)) URL.revokeObjectURL(objectUrl); };
  let total = 0;
  try {
    const asset = async (path: string, type: string): Promise<string> => {
      signal.throwIfAborted();
      const resolved = new URL(path, url);
      if (!['http:', 'https:'].includes(resolved.protocol)) throw new Error('Live2D asset URL must use HTTP(S).');
      const result = await fetch(resolved, { signal });
      if (!result.ok) throw new Error('Unable to load Live2D asset: ' + result.status);
      const declared = Number(result.headers.get('content-length'));
      if (declared > 64 * 1024 * 1024) throw new Error('Live2D assets exceed 64 MB.');
      const bytes = await waitFor(result.arrayBuffer(), signal);
      signal.throwIfAborted();
      total += bytes.byteLength;
      if (total > 64 * 1024 * 1024) throw new Error('Live2D assets exceed 64 MB.');
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type }));
      urls.push(objectUrl); return objectUrl;
    };
    const moc = await asset(refs.Moc, 'application/octet-stream');
    const textures: string[] = [];
    for (const path of refs.Textures) textures.push(await asset(path, /\.jpe?g$/i.test(path) ? 'image/jpeg' : 'image/png'));
    const references: ModelReferences = { Moc: moc, Textures: textures };
    if (typeof refs.Physics === 'string') references.Physics = await asset(refs.Physics, 'application/json');
    if (typeof refs.Pose === 'string') references.Pose = await asset(refs.Pose, 'application/json');
    // No motion audio, automatic expressions or extra URLs: common controller owns lips/blinks.
    return { settings: { Version: 3, FileReferences: references, url: url.href }, dispose };
  } catch (error) { dispose(); throw error; }
}
