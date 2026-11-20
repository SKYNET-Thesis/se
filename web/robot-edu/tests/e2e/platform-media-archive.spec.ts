import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/**
 * Learning Media archive / restore against the real API, database and local S3: soft state only (nothing is deleted), reference-checked,
 * tenant-isolated, RBAC-protected, audited, and archived files can be neither attached nor served.
 */
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim();
const run = Date.now().toString(36);
const fixtureDir = new URL('./fixtures/media/', import.meta.url);

test.describe.serial('Learning Media archive and restore', () => {
  let courseId = ''; let pdfId = ''; let pngId = '';

  test('UI: upload, archive, see it under "Show archived", restore', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'instructor');
    const course = await call(page, token, 'POST', '/admin/courses', { title: `Media archive ${run}` });
    expect(course.status).toBe(201); courseId = course.body.id;
    await page.goto(`/admin/courses/${courseId}?tab=media`);
    const library = page.getByRole('region', { name: 'Learning Media Library' });
    for (const [name, mime] of [['safety-guide.pdf', 'application/pdf'], ['emergency-stop.png', 'image/png']] as const) {
      await library.locator('input[type="file"]').setInputFiles({ name, mimeType: mime, buffer: await readFile(new URL(name, fixtureDir)) });
      await expect(library.getByRole('heading', { name })).toBeVisible({ timeout: 30_000 });
    }
    const listed = (await call(page, token, 'GET', `/admin/courses/${courseId}/media`)).body as Array<{ id: string; original_filename: string }>;
    pdfId = listed.find((m) => m.original_filename === 'safety-guide.pdf')!.id; pngId = listed.find((m) => m.original_filename === 'emergency-stop.png')!.id;

    await library.getByRole('button', { name: 'Archive safety-guide.pdf' }).click();
    await expect(library.getByRole('status').filter({ hasText: 'was archived' })).toBeVisible();
    await expect(library.getByRole('heading', { name: 'safety-guide.pdf' })).toHaveCount(0);
    await expect(library.getByRole('heading', { name: 'emergency-stop.png' })).toBeVisible();
    await library.getByRole('button', { name: 'Show archived' }).click();
    await expect(library.getByRole('heading', { name: 'safety-guide.pdf' })).toBeVisible();
    await expect(library.getByRole('heading', { name: 'emergency-stop.png' })).toHaveCount(0);
    await library.getByRole('button', { name: 'Restore safety-guide.pdf' }).click();
    await expect(library.getByRole('status').filter({ hasText: 'was restored' })).toBeVisible();
    await library.getByRole('button', { name: 'Back to library' }).click();
    await expect(library.getByRole('heading', { name: 'safety-guide.pdf' })).toBeVisible();
    expect(psql(`select count(*) from learning_media_assets where id='${pdfId}' and archived_at is null`)).toBe('1');
  });

  test('a referenced file cannot be archived; once released it can, and then it can be neither attached nor reused', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'instructor');
    const lesson = await call(page, token, 'POST', `/admin/courses/${courseId}/lessons`, { title: `Module ${run}` });
    const section = await call(page, token, 'POST', `/author/lessons/${lesson.body.id}/sections`, { title: 'Section', ordinal: 1 });
    const activity = await call(page, token, 'POST', `/author/sections/${section.body.id}/activities`, { title: `Reading ${run}`, type: 'reading', ordinal: 1, contentRef: { kind: 'none' }, content: { version: 1, mediaIds: [pdfId], blocks: [{ type: 'paragraph', text: 'See the guide.' }] } });
    expect(activity.status, JSON.stringify(activity.body)).toBe(201);

    const blocked = await call(page, token, 'POST', `/admin/media/${pdfId}/archive`, { reason: 'outdated' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('MEDIA_IN_USE');
    expect(blocked.body.message).toContain(`Reading ${run}`); expect(blocked.body.message).toContain(`Module ${run}`);
    expect(blocked.body.references).toHaveLength(1);
    expect(psql(`select count(*) from learning_media_assets where id='${pdfId}' and archived_at is not null`)).toBe('0');   // nothing changed

    // an image block counts as a reference too
    const image = await call(page, token, 'PATCH', `/author/activities/${activity.body.id}`, { content: { version: 1, mediaIds: [pngId], blocks: [{ type: 'image', mediaId: pngId, alt: 'Stop' }] } });
    expect(image.status, JSON.stringify(image.body)).toBe(200);
    expect((await call(page, token, 'POST', `/admin/media/${pngId}/archive`, {})).status).toBe(409);
    expect((await call(page, token, 'POST', `/admin/media/${pdfId}/archive`, { reason: 'outdated' })).status).toBe(200);   // the PDF is no longer referenced

    const hidden = await call(page, token, 'GET', `/admin/courses/${courseId}/media`);
    expect((hidden.body as Array<{ id: string }>).map((m) => m.id)).not.toContain(pdfId);
    const archived = (await call(page, token, 'GET', `/admin/courses/${courseId}/media?archived=true`)).body as Array<{ id: string; archive_reason: string }>;
    expect(archived.find((m) => m.id === pdfId)?.archive_reason).toBe('outdated');
    // archived: cannot be attached to lesson content
    const attach = await call(page, token, 'PATCH', `/author/activities/${activity.body.id}`, { content: { version: 1, mediaIds: [pdfId], blocks: [{ type: 'paragraph', text: 'x' }] } });
    expect(attach.status).toBe(409); expect(JSON.stringify(attach.body)).toMatch(/archived/i);
    // idempotent, and the object record still exists (nothing deleted)
    expect((await call(page, token, 'POST', `/admin/media/${pdfId}/archive`, {})).status).toBe(200);
    expect(psql(`select count(*) from learning_media_assets where id='${pdfId}'`)).toBe('1');
    // restore makes it attachable again
    expect((await call(page, token, 'POST', `/admin/media/${pdfId}/restore`)).status).toBe(200);
    expect((await call(page, token, 'POST', `/admin/media/${pdfId}/restore`)).status).toBe(200);
    expect((await call(page, token, 'PATCH', `/author/activities/${activity.body.id}`, { content: { version: 1, mediaIds: [pdfId], blocks: [{ type: 'paragraph', text: 'x' }] } })).status).toBe(200);
    expect((await call(page, token, 'POST', `/admin/media/${pdfId}/archive`, {})).status).toBe(409);                      // in use again
  });

  test('tenant isolation, RBAC and audit', async ({ page }) => {
    const fixture = await loadFixture();
    for (const who of ['otherSchoolAdmin', 'student', 'otherStudent']) {
      const t = await signIn(page, fixture, who);
      for (const path of [`/admin/media/${pngId}/archive`, `/admin/media/${pngId}/restore`]) expect((await call(page, t, 'POST', path, {})).status, `${who} ${path}`).toBe(404);
      expect((await call(page, t, 'GET', `/admin/courses/${courseId}/media?archived=true`)).status, `${who} list`).toBe(404);
    }
    expect((await call(page, '', 'POST', `/admin/media/${pngId}/archive`, {})).status).toBe(401);
    const orgId = psql(`select organization_id from learning_courses where id='${courseId}'`);
    expect(Number(psql(`select count(*) from audit_logs where organization_id='${orgId}' and action='media.archived' and target_id in ('${pdfId}','${pngId}')`))).toBeGreaterThanOrEqual(2);   // UI archive + API archive (idempotent calls add none)
    expect(Number(psql(`select count(*) from audit_logs where organization_id='${orgId}' and action='media.restored' and target_id='${pdfId}'`))).toBe(2);
  });
});
