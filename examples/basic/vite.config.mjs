import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

const root = fileURLToPath(new URL("./", import.meta.url));
const repository = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repository, "");
  const gateway = `http://${env.VOICE_AGENT_HOST || "127.0.0.1"}:${env.VOICE_AGENT_PORT || "8787"}`;
  return {
    root,
    base: "/hoho-avatar/",
    envDir: repository,
    // Shared demo artwork and audio only; the SDK is installed from npm.
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
