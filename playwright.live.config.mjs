// The one real-Google test, against a PR's Netlify preview (tests/live). GitHub runs it when the preview is ready.
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/live',
  timeout: 180_000,
  retries: 1,
  reporter: [['list']],
  use: { ...devices['Pixel 7'], baseURL: process.env.PREVIEW_URL, serviceWorkers: 'block', trace: 'off' },
});
