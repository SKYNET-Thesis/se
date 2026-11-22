import { defineConfig } from '@playwright/test';

const apiBaseUrl = process.env.VISTA_E2E_API_BASE_URL ?? '';
const fixtureFile = process.env.VISTA_E2E_FIXTURE_FILE ?? '';
const apiUrl = apiBaseUrl ? new URL(apiBaseUrl) : undefined;
const fixtureUrl = fixtureFile ? new URL(`file://${fixtureFile}`) : undefined;

if (!apiUrl || !['127.0.0.1', 'localhost', '[::1]'].includes(apiUrl.hostname) || !apiUrl.port || !apiUrl.pathname.endsWith('/api/v1')) {
  throw new Error('Set VISTA_E2E_API_BASE_URL to a loopback Education API URL ending in /api/v1.');
}
if (!fixtureFile || !fixtureUrl?.pathname.startsWith('/tmp/')) {
  throw new Error('Set VISTA_E2E_FIXTURE_FILE to the JSON fixture emitted by the isolated seed script under /tmp.');
}

const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
if (![54321, 54323].includes(authPort)) throw new Error('E2E auth must use an isolated loopback port.');
const webPort = Number(process.env.VISTA_E2E_WEB_PORT ?? 4173);
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) throw new Error('E2E web server must use a valid isolated loopback port.');
const supabaseUrl = `http://127.0.0.1:${authPort}`;
const anonKey = process.env.VISTA_E2E_SUPABASE_ANON_KEY ?? 'local-e2e-anon-key-not-a-secret';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/student-auth-*.spec.ts', '**/staff-auth-*.spec.ts'], // real-Supabase suite: run with playwright.student-auth.config.ts (see docs/operations/student-temp-password.md)
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    actionTimeout: 10_000,
    browserName: 'chromium',
    headless: true,
    launchOptions: { executablePath: process.env.VISTA_E2E_CHROMIUM_PATH ?? '/usr/bin/google-chrome' },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/e2e/local-jwks-server.mjs',
      url: `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
      reuseExistingServer: process.env.VISTA_E2E_REUSE_LOCAL_AUTH === '1',
      timeout: 10_000,
      env: { VISTA_E2E_JWKS_PORT: String(authPort) },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        VITE_API_BASE_URL: apiBaseUrl,
        VITE_SUPABASE_URL: supabaseUrl,
        VITE_SUPABASE_ANON_KEY: anonKey,
      },
    },
  ],
});
