import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e-pages', workers: 1, retries: 0, timeout: 60_000, reporter: 'list',
  outputDir: './test-results/pages',
  globalSetup: './e2e-pages/global-setup.mjs',
  use: {
    baseURL: 'http://127.0.0.1:5198/hoho-avatar/',
    viewport: { width: 1280, height: 1000 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
});
