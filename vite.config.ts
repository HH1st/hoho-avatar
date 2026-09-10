import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const gateway = `http://${env.VOICE_AGENT_HOST || "127.0.0.1"}:${env.VOICE_AGENT_PORT || "8787"}`;
  return {
    base: "/hoho-avatar/",
    server: {
      proxy: {
        "/voice-agent/healthz": {
          target: gateway,
          rewrite: () => "/healthz",
        },
        "/voice-agent": {
          target: gateway,
          ws: true,
        },
      },
    },
  };
});
