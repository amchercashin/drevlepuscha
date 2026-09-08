import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser', timeout: 30_000, workers: 1, fullyParallel: false,
  reporter: 'list',
  projects: [{name:'webgl2'},{name:'webgpu'}],
  use: {
    channel: process.env.BROWSER_CHANNEL || 'chrome', headless: false,
    viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1,
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: { args: ['--disable-backgrounding-occluded-windows'] },
    screenshot: 'only-on-failure',
  },
  webServer: {command:'npm run preview',url:'http://127.0.0.1:4173',reuseExistingServer:!process.env.CI,timeout:120_000},
});
