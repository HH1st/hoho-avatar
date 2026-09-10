import { loadEnvFile } from 'node:process';
import { createServer } from 'vite';

try { loadEnvFile('.env'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const host = process.env.VOICE_AGENT_HOST || '127.0.0.1';
const port = process.env.VOICE_AGENT_PORT || '8787';
const healthUrl = `http://${host}:${port}/healthz`;
let frontend;
let closeGateway;
let stopping = false;

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  const results = await Promise.allSettled([frontend?.close(), closeGateway?.()]);
  for (const result of results) {
    if (result.status === 'rejected') { console.error(result.reason.message); process.exitCode = 1; }
  }
}
process.on('SIGINT', () => { void stop(); });
process.on('SIGTERM', () => { void stop(); });

async function healthy() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1000) });
    const body = await response.json();
    return response.ok && body.ok === true && typeof body.authentication === 'string';
  } catch { return false; }
}

try {
  if (await healthy()) console.log(`Using running voice gateway at ${healthUrl}`);
  else {
    ({ closeGateway } = await import('../server/voice-agent-gateway.mjs'));
    let ready = false;
    for (let attempt = 0; attempt < 40 && !stopping; attempt += 1) {
      if (await healthy()) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error('Voice gateway did not become healthy. Check .env and the log above.');
  }
  if (!stopping) {
    frontend = await createServer({ configFile: 'examples/basic/vite.config.mjs', server: { host: '127.0.0.1', port: Number(process.env.PORT || 5173), strictPort: true } });
    await frontend.listen();
    frontend.printUrls();
  }
} catch (error) {
  console.error(error.message);
  await stop(1);
}
