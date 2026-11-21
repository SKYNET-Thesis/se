import { spawn, type ChildProcess } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * Digital Twin in a REAL BROWSER against the REAL Twin service (uvicorn, mock stream): the SO-101 viewer, six joint readings, honest
 * source labelling (Simulation / Mock, never physical), freshness, and the outage -> stale -> reconnect lifecycle.
 * Nothing here claims hardware synchronisation: the Twin's own mock stream is the only source.
 */
const fixture = JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as { users: Record<string, { authUserId: string }> };
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);
const TWIN = 'http://127.0.0.1:8767';
const twinDir = path.resolve(process.cwd(), '../../services/digital-twin');
const JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];

let twin: ChildProcess | undefined;
async function startTwin() {
  twin = spawn('uv', ['run', '--frozen', 'uvicorn', 'vista_digital_twin.app:app', '--host', '127.0.0.1', '--port', '8767'], { cwd: twinDir, detached: true, stdio: 'ignore', env: { ...process.env, VISTA_TWIN_AUTH_SECRET: 'twsecret_local', PYTHONPATH: 'src' } });
  for (let i = 0; i < 60; i += 1) { try { if ((await fetch(`${TWIN}/health`)).ok) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('Digital Twin did not start');
}
async function stopTwin() {
  if (twin?.pid) { try { process.kill(-twin.pid, 'SIGKILL'); } catch { /* gone */ } }
  twin = undefined;
  for (let i = 0; i < 40; i += 1) { try { await fetch(`${TWIN}/health`); await new Promise((r) => setTimeout(r, 250)); } catch { return; } }
}
async function signIn(page: Page, who: string) {
  const session = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json();
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), session);
}

test.afterAll(async () => { await stopTwin(); });

test('student Robot Lab: the Twin viewer shows six joints from the real Twin, is labelled simulation, goes stale on an outage and reconnects', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await startTwin();
  await signIn(page, 'student');
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Robot Lab' })).toBeVisible();
  await page.getByRole('button', { name: 'Simulation preview' }).click();
  const panel = page.getByRole('region', { name: /Digital Twin/i });
  await expect(panel).toBeVisible();

  // connected, fresh, honestly labelled; never presented as physical
  await expect(panel.getByText('connected', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText('Simulation / Mock')).toBeVisible();
  await expect(panel.getByText('Fresh', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByText('Simulation selected')).toBeVisible();
  await expect(panel.getByText('Physical / measured follower')).toHaveCount(0);
  await expect(panel.locator('canvas').first()).toBeVisible();                                // the SO-101 model viewer is mounted
  for (const joint of JOINTS) await expect(panel.getByRole('term').filter({ hasText: new RegExp(`^${joint}$`) })).toHaveCount(1);
  const readings = panel.locator('dd.font-mono');
  await expect(readings).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) await expect(readings.nth(index)).toHaveText(/^-?\d+(\.\d+)? (rad|percent)$/);

  // values move: the stream is live, not a static page
  const before = await readings.allTextContents();
  await expect.poll(async () => (await readings.allTextContents()).join('|'), { timeout: 15_000 }).not.toBe(before.join('|'));

  // outage: the stream stops, the page reports it instead of showing old values as live
  await stopTwin();
  await expect(panel.getByText('Stale / unavailable')).toBeVisible({ timeout: 20_000 });
  await expect(panel.getByText('disconnected', { exact: true })).toBeVisible({ timeout: 20_000 });

  // recovery: the viewer reconnects by itself
  await startTwin();
  await expect(panel.getByText('connected', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText('Fresh', { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(errors).toEqual([]);
});
