import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export interface Fixture { schoolId: string; otherSchoolId: string; users: Record<string, { authUserId: string; userId: string }>; [key: string]: unknown }
export const loadFixture = async () => JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as Fixture;
export const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

export async function signIn(page: Page, fixture: Fixture, who: string) {
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${fixture.users[who].authUserId}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token;
}
export async function call(page: Page, token: string, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status(), body };
}

/** School Admin delivers a published course through the real UI: classroom + offering + the given members. Returns the classroom id. */
export async function deliverCourse(page: Page, fixture: Fixture, courseTitle: string, className: string, members: string[], options: { selfEnrollment?: boolean; capacity?: number } = {}) {
  const adminToken = await signIn(page, fixture, 'schoolAdmin');
  const code = `C${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`.toUpperCase();
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(code);
  await create.getByLabel('Published course').selectOption({ label: courseTitle });
  await create.getByLabel('School offering code').fill(`OFF-${code}`.slice(0, 40));
  await create.getByRole('button', { name: 'Create classroom' }).click();
  await expect(create).not.toBeVisible();
  await expect(page).toHaveURL(/\/school\/classrooms\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'Classroom details' })).toBeVisible();
  for (const person of members) {
    await page.getByRole('button', { name: 'Add member' }).click();
    const member = page.getByRole('dialog', { name: 'Add classroom member' });
    await member.getByLabel('Search eligible members').fill(person);
    await member.getByRole('radio', { name: new RegExp(person) }).check();
    await member.getByRole('button', { name: 'Add member' }).click();
    await expect(member).not.toBeVisible();
  }
  const classroomId = ((await call(page, adminToken, 'GET', `/education-admin/organizations/${fixture.schoolId}/classrooms`)).body as Array<{ id: string; name: string }>).find((row) => row.name === className)!.id;
  if (options.selfEnrollment || options.capacity) {
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit classroom' });
    if (options.capacity) await dialog.getByLabel(/Capacity/).fill(String(options.capacity));
    if (options.selfEnrollment) await dialog.getByLabel('Open for student self-enrollment').check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).not.toBeVisible();
  }
  return classroomId;
}
