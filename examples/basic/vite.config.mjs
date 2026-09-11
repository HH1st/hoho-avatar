import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { hasLive2DSample, live2dSamplePlugin } from './live2dSample.mjs';

const root = fileURLToPath(new URL("./", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repository, "");
  const gateway = `http://${env.VOICE_AGENT_HOST || "127.0.0.1"}:${env.VOICE_AGENT_PORT || "8787"}`;
  return {
    root,
    plugins: [live2dSamplePlugin()],
    define: {
      'import.meta.env.HOHO_LIVE2D_SAMPLE': JSON.stringify(hasLive2DSample),
      'import.meta.env.HOHO_LIVE2D_PAGES': JSON.stringify(mode === 'pages'),
    },
    base: "/hoho-avatar/",
    envDir: repository,
    // One studio exercises the checked-out SDK with either renderer.
    publicDir: fileURLToPath(new URL("../../public/", import.meta.url)),
    optimizeDeps: { entries: ["index.html"] },
    server: {
      proxy: {
        "/voice-agent/healthz": { target: gateway, rewrite: () => "/healthz" },
        "/voice-agent": { target: gateway, ws: true },
      },
    },
  };
});
