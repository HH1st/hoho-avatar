import { createServer } from "vite";

// Own the server in-process: teardown does not depend on shell process-tree killing.
export default async function setup() {
  const previous = process.env.VITE_VOICE_AGENT_URL;
  process.env.VITE_VOICE_AGENT_URL = "";
  const server = await createServer({
    configFile: "examples/basic/vite.config.mjs",
    mode: "e2e",
    server: { host: "127.0.0.1", port: 5193, strictPort: true },
  });
  await server.listen();
  return async () => {
    await server.close();
    if (previous === undefined) delete process.env.VITE_VOICE_AGENT_URL;
    else process.env.VITE_VOICE_AGENT_URL = previous;
  };
}
