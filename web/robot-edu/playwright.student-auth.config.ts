import { defineConfig } from '@playwright/test';

/** Student Temporary Password acceptance: real Education API + real Supabase GoTrue + real PostgreSQL (see docs/operations/student-temp-password.md). */
const withUi = process.env.SA_WITH_UI === '1';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: process.env.SA_WITH_UI === '1' ? ['**/student-auth-ui.spec.ts', '**/student-recovery-ui.spec.ts'] : '**/student-auth-api.spec.ts',
  fullyParallel: false, workers: 1, retries: 0, reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173', actionTimeout: 10_000, browserName: 'chromium', headless: true, trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.VISTA_E2E_CHROMIUM_PATH ?? '/usr/bin/google-chrome' },
  },
  webServer: withUi ? [{
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30_000,
    env: { VITE_API_BASE_URL: process.env.SA_API ?? '', VITE_SUPABASE_URL: 'http://127.0.0.1:54323', VITE_SUPABASE_ANON_KEY: process.env.SA_ANON_KEY ?? '' },
  }] : [],
});
