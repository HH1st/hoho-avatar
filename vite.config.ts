import { defineConfig } from "vite";

export default defineConfig({
  base: "/hoho-avatar/",
  server: {
    proxy: {
      "/voice-agent": {
        target: "ws://127.0.0.1:8787",
        ws: true,
      },
    },
  },
});
