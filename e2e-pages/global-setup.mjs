import { preview } from 'vite';
export default async function setup() {
  const server = await preview({ configFile: 'examples/basic/vite.config.mjs',
    preview: { host: '127.0.0.1', port: 5198, strictPort: true } });
  return () => new Promise((resolve) => server.httpServer.close(resolve));
}
