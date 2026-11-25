// Robot-phone tests (tests/e2e). Run: npm run e2e   (builds the site first, then starts tests/e2e/server.mjs by itself)
// Sizes come from the people who use the app: Jesse's Pixel, the family's iPhones, the girls' Fire tablets, a computer.
// iPhone runs on WebKit (Safari's engine) in GitHub; this container has only Chromium, so locally it borrows Chromium.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5199;
const webkit = !!process.env.CI || process.env.E2E_WEBKIT === '1';
const fire = {   // Amazon Fire HD 10 (Kids): 1920x1200 screen, Silk browser / the tablet app's WebView
  viewport: { width: 800, height: 1280 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 11; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/120.4.1 like Chrome/120.0.6099.230 Safari/537.36',
};

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  snapshotPathTemplate: 'tests/e2e/approved/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,                       // one pretend site, emptied before each test
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'block',        // so the fake Google answers every upload (the offline worker has its own test)
    trace: 'off',
    screenshot: 'only-on-failure',
    locale: 'en-US',
    timezoneId: 'America/Chicago',
  },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 15'], ...(webkit ? {} : { browserName: 'chromium', defaultBrowserType: 'chromium' }) } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'fire-tablet', use: { ...devices['Galaxy Tab S9'], ...fire } },
    { name: 'computer', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `node tests/e2e/server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/robots.txt`,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
  },
});
