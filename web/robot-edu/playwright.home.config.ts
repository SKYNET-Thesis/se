import { defineConfig } from '@playwright/test';

/**
 * The public homepage needs no API, database or sign-in, so its browser checks run on their own: `npx playwright test -c playwright.home.config.ts`.
 * Set VISTA_HOME_E2E_URL to test an already running build (for example `vite preview`); otherwise the dev server is started.
 * Add real-GPU flags with VISTA_E2E_CHROMIUM_ARGS="--use-angle=gl".
 */
const external = process.env.VISTA_HOME_E2E_URL;
const port = Number(process.env.VISTA_HOME_E2E_PORT ?? 4174);

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'home-*.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: external ?? `http://127.0.0.1:${port}`, browserName: 'chromium', headless: true, actionTimeout: 15_000, trace: 'retain-on-failure' },
  webServer: external ? undefined : { command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 60_000 },
});
