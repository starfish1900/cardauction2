import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests: the real server (from source) and the production build of the web client,
 * served on another origin exactly like on Render, driven through real browsers.
 */
const SERVER_PORT = 3100;
const WEB_PORT = 4173;
// A preinstalled Chromium (set PW_CHROMIUM_PATH); CI installs Playwright's own instead.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  // One server for every test: games and rate limits stay predictable when run one by one.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @cardauction/server exec tsx src/main.ts',
      url: `http://localhost:${SERVER_PORT}/healthz`,
      env: {
        NODE_ENV: 'test',
        PORT: String(SERVER_PORT),
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        LOG_LEVEL: 'warn',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      env: { VITE_SERVER_URL: `http://localhost:${SERVER_PORT}` },
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
