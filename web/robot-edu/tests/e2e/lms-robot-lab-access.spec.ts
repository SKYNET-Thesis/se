import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/**
 * Journey F (Web side only, no physical robot): the School Admin allocates an entitled robot to a classroom;
 * an authorized classroom student sees the allocated Lab; a user of another school does not, and the
 * robot-wide viewer scope is refused for them. Allocation, listing and denial are asserted at the real API and in the browser.
 */
interface Fixture {
  classroomId: string;
  allocatedRobotId: string;
  users: Record<string, { userId: string; authUserId: string }>;
}
const fixturePath = process.env.VISTA_E2E_FIXTURE_FILE;
if (!fixturePath?.startsWith('/tmp/')) throw new Error('An isolated /tmp fixture file is required.');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture;
const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

async function session(page: Page, authUserId: string) {
  const response = await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${authUserId}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { access_token: string };
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Availability { id: string; name: string; allocationStatus: string; viewerAccess: string }

test('Robot Lab: an allocated classroom student sees the Lab, a user of another school does not, and unauthorized scope is refused', async ({ page }) => {
  const admin = await session(page, fixture.users.schoolAdmin.authUserId);
  const student = await session(page, fixture.users.student.authUserId);
  const outsider = await session(page, fixture.users.otherSchoolAdmin.authUserId);

  const allocated = await page.request.put(`${apiBase}/education-admin/classrooms/${fixture.classroomId}/robot-allocation`, {
    headers: bearer(admin.access_token), data: { robotId: fixture.allocatedRobotId },
  });
  expect(allocated.status()).toBe(200);

  const mine = await page.request.get(`${apiBase}/robots/digital-twin/availability`, { headers: bearer(student.access_token) });
  expect(mine.status()).toBe(200);
  const mineList = await mine.json() as Availability[];
  const robot = mineList.find((entry) => entry.id === fixture.allocatedRobotId);
  expect(robot, 'the allocated robot is listed for the classroom student').toBeTruthy();
  expect(robot!.allocationStatus).toBe('allocated');

  const theirs = await page.request.get(`${apiBase}/robots/digital-twin/availability`, { headers: bearer(outsider.access_token) });
  expect(theirs.status()).toBe(200);
  const theirList = await theirs.json() as Availability[];
  expect(theirList.find((entry) => entry.id === fixture.allocatedRobotId)).toBeUndefined();
  expect(theirList.every((entry) => entry.viewerAccess !== 'authorized')).toBe(true);

  const denied = await page.request.post(`${apiBase}/robots/${fixture.allocatedRobotId}/digital-twin/viewer-scope`, { headers: bearer(outsider.access_token) });
  expect([403, 404]).toContain(denied.status());
  const anonymous = await page.request.get(`${apiBase}/robots/digital-twin/availability`);
  expect(anonymous.status()).toBe(401);

  // Browser: the authorized student's Robot Lab page lists the allocated robot; the outsider's does not.
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto('/');
  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), student);
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Robot Lab' })).toBeVisible();
  await expect(page.getByText(robot!.name).first()).toBeVisible();

  await page.evaluate((value) => localStorage.setItem('sb-127-auth-token', JSON.stringify(value)), outsider);
  await page.goto('/lab');
  await expect(page.getByRole('heading', { name: 'Robot Lab' })).toBeVisible();
  await expect(page.getByText(robot!.name)).toHaveCount(0);
  expect(consoleErrors).toEqual([]);
});
