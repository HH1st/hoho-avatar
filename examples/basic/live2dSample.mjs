import { existsSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = new URL('../../tmp/live2d-sample/', import.meta.url);
const files = {
  'live2dcubismcore.min.js': 'text/javascript',
  'Wanko/Wanko.model3.json': 'application/json',
  'Wanko/Wanko.moc3': 'application/octet-stream',
  'Wanko/Wanko.physics3.json': 'application/json',
  'Wanko/Wanko.1024/texture_00.png': 'image/png',
};
export const hasLive2DSample = Object.keys(files).every((name) => existsSync(new URL(name, directory)));

/** Serves only the explicit dev fixture allowlist, never the rest of tmp/. */
export function live2dSamplePlugin() {
  return {
    name: 'local-live2d-sample',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__live2d/', (request, response, next) => {
        const name = request.url?.split('?')[0]?.replace(/^\//, '') ?? '';
        if (!Object.hasOwn(files, name) || !hasLive2DSample) { next(); return; }
        response.setHeader('Content-Type', files[name]);
        createReadStream(fileURLToPath(new URL(name, directory))).on('error', () => response.destroy()).pipe(response);
      });
    },
  };
}
