import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export interface Fixture { schoolId: string; otherSchoolId: string; users: Record<string, { authUserId: string; userId: string; email?: string }>; [key: string]: unknown }
export const loadFixture = async () => JSON.parse(await readFile(process.env.VISTA_E2E_FIXTURE_FILE!, 'utf8')) as Fixture;
export const apiBase = process.env.VISTA_E2E_API_BASE_URL!;
const authPort = Number(process.env.VISTA_E2E_JWKS_PORT ?? 54321);

/** Provision a synthetic identity in the local GoTrue container for tests that need arbitrary JWT claims. */
export async function createLocalAuthIdentity(request: APIRequestContext, identity: { id: string; email?: string; phone?: string }) {
  const response = await request.post(`http://127.0.0.1:${authPort}/__test/users`, { data: identity });
  expect(response.ok(), `local GoTrue fixture identity creation returned ${response.status()}`).toBeTruthy();
  return response.json() as Promise<{ id: string; email?: string; phone?: string }>;
}

export async function signIn(page: Page, fixture: Fixture, who: string) {
  const identity = fixture.users[who];
  const email = identity.email ? `&email=${encodeURIComponent(identity.email)}` : '';
  const s = await (await page.request.get(`http://127.0.0.1:${authPort}/token?sub=${identity.authUserId}${email}`)).json() as { access_token: string };
  if (page.url() === 'about:blank') await page.goto('/');
  await page.evaluate((v) => localStorage.setItem('sb-127-auth-token', JSON.stringify(v)), s);
  return s.access_token;
}
export async function call(page: Page, token: string, method: string, path: string, data?: unknown) {
  const r = await page.request.fetch(`${apiBase}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(data === undefined ? {} : { data }) });
  const text = await r.text(); let body: any = text; try { body = JSON.parse(text); } catch { /* text */ }
  return { status: r.status(), body };
}

/** Create and activate an existing offering before the classroom creation flow starts. */
export async function createActiveOffering(page: Page, fixture: Pick<Fixture, 'schoolId'>, token: string, courseTitle: string, code: string) {
  const published = await call(page, token, 'GET', `/education-admin/organizations/${fixture.schoolId}/published-courses`);
  expect(published.status).toBe(200);
  const course = (published.body as Array<{ id: string; title: string }>).find((item) => item.title === courseTitle);
  expect(course, `published course ${courseTitle} is available to the school`).toBeTruthy();
  const created = await call(page, token, 'POST', `/education-admin/organizations/${fixture.schoolId}/course-offerings`, { courseId: course!.id, code, title: courseTitle });
  expect(created.status).toBe(201);
  const offering = created.body as { id: string; title: string; code: string };
  const activated = await call(page, token, 'POST', `/education-admin/organizations/${fixture.schoolId}/course-offerings/${offering.id}/activate`);
  expect([200, 201]).toContain(activated.status);
  return offering;
}

/** School Admin delivers a published course through the real UI: classroom + offering + the given members. Returns the classroom id. */
export async function deliverCourse(page: Page, fixture: Fixture, courseTitle: string, className: string, members: string[], options: { selfEnrollment?: boolean; capacity?: number } = {}) {
  const adminToken = await signIn(page, fixture, 'schoolAdmin');
  const code = `C${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`.toUpperCase();
  const offering = await createActiveOffering(page, fixture, adminToken, courseTitle, `OFF-${code}`.slice(0, 40));
  await page.goto('/school/classrooms');
  await page.getByRole('button', { name: 'Create classroom' }).click();
  const create = page.getByRole('dialog', { name: 'Create classroom' });
  await create.getByLabel('Classroom name').fill(className);
  await create.getByLabel('Classroom code').fill(code);
  await create.getByLabel('Active course offering').selectOption({ label: `${offering.title} (${offering.code})` });
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
    await expect(dialog.getByLabel('Classroom name')).toHaveValue(className); // the dialog is hydrated from the loaded classroom before it is edited
    if (options.capacity) await dialog.getByLabel(/Capacity/).fill(String(options.capacity));
    if (options.selfEnrollment) await dialog.getByLabel('Open for student self-enrollment').check();
    await dialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(dialog).not.toBeVisible();
  }
  return classroomId;
}
