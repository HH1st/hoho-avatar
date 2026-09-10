import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: "list",
  globalSetup: "./e2e/global-setup.mjs",
  use: {
    baseURL: "http://127.0.0.1:5193/hoho-avatar/",
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader"] },
    trace: "retain-on-failure",
  },
});
