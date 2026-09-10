import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLive2DAssets } from '../src/live2d/internal/CubismAssets';

function setup() {
  vi.stubGlobal('document', { baseURI: 'https://app.test/studio/' });
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  let index = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test-' + ++index);
  const settings = { Version: 3, FileReferences: { Moc: 'a.moc3', Textures: ['tex.png'], Physics: 'a.physics3.json', Motions: { Idle: [{ File: 'idle.json', Sound: 'sound.wav' }] } } };
  const fetch = vi.fn(async (url: string | URL) => new Response(String(url).endsWith('.model3.json') ? JSON.stringify(settings) : 'asset'));
  vi.stubGlobal('fetch', fetch);
  return { revoke, settings, fetch };
}
describe('Live2D owned asset loading', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('resolves relative assets, strips unsolicited motion/audio and releases its own URLs', async () => {
    const { fetch, revoke } = setup();
    const assets = await loadLive2DAssets('/model/a.model3.json', new AbortController().signal);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(['https://app.test/model/a.model3.json', 'https://app.test/model/a.moc3', 'https://app.test/model/tex.png', 'https://app.test/model/a.physics3.json']);
    expect(assets.settings.FileReferences).toEqual({ Moc: 'blob:test-1', Textures: ['blob:test-2'], Physics: 'blob:test-3' });
    assets.dispose(); assets.dispose(); expect(revoke).toHaveBeenCalledTimes(3);
  });
  it('revokes partial assets when a later asset fails', async () => {
    const { fetch, revoke } = setup();
    fetch.mockImplementation(async (url) => String(url).endsWith('tex.png') ? new Response('', { status: 404 }) : new Response(String(url).endsWith('.model3.json') ? JSON.stringify({ Version: 3, FileReferences: { Moc: 'a.moc3', Textures: ['tex.png'] } }) : 'moc'));
    await expect(loadLive2DAssets('/a.model3.json', new AbortController().signal)).rejects.toThrow('404');
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:test-1');
  });
  it('rejects wrong model versions and executable asset URL schemes', async () => {
    const { settings } = setup();
    settings.Version = 2;
    await expect(loadLive2DAssets('/a.model3.json', new AbortController().signal)).rejects.toThrow('Cubism 3/4');
    settings.Version = 3; settings.FileReferences.Moc = 'javascript:bad';
    await expect(loadLive2DAssets('/a.model3.json', new AbortController().signal)).rejects.toThrow('HTTP(S)');
  });
});
