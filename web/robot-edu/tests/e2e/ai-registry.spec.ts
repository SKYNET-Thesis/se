import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/**
 * SRS FR-08 / UC-08: the read-only Model / Dataset Registry. Real browser, real Education API, isolated PostgreSQL.
 * Seeded rows are disposable; the model.use grant is removed again so no other spec is affected.
 * The API answers 404 to an account without model.use (a deliberate, unit-tested gate), and the page must say so in words.
 */
const run = Date.now().toString(36).toUpperCase();
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim().split('\n')[0];
const PUBLIC = `Registry public ${run}`; const PRIVATE = `Registry private ${run}`;
const ids: Record<string, string> = {};

test.describe.serial('AI model & dataset registry', () => {
  test.beforeAll(async () => {
    const fixture = await loadFixture(); const student = fixture.users.student.userId;
    ids.task = psql(`insert into benchmark_tasks(code,name,object_type,target_container,pass_criterion) values('BT-${run}','Pick cube ${run}','cube','box','cube inside the box') returning id`);
    ids.scenario = psql(`insert into simulation_scenarios(benchmark_task_id,name,version,engine) values('${ids.task}','Scenario ${run}',1,'mujoco') returning id`);
    ids.dataset = psql(`insert into dataset_versions(created_by,name,version,huggingface_repo,huggingface_revision,provenance,is_frozen) values('${student}','Demos ${run}','v1','vista/demos','r9','{"source":"simulation","episodes":30}',true) returning id`);
    ids.train = psql(`insert into training_runs(dataset_version_id,requested_by,policy_name,status,compute_source,metrics) values('${ids.dataset}','${student}','act-${run}','succeeded','local','{"loss":0.12}') returning id`);
    ids.publicModel = psql(`insert into ai_models(name,description,owner_type,visibility,status) values('${PUBLIC}','Tabletop pick and place.','system','public','active') returning id`);
    ids.privateModel = psql(`insert into ai_models(name,description,owner_type,visibility,status) values('${PRIVATE}','Not for everyone.','system','private','active') returning id`);
    ids.checkpoint = psql(`insert into model_checkpoints(ai_model_id,training_run_id,version,step,huggingface_repo,huggingface_revision,metrics) values('${ids.publicModel}','${ids.train}','v2-${run}',4000,'vista/pnp','abc123','{"success_rate":0.8,"nested":{"x":1}}') returning id`);
    psql(`insert into model_checkpoints(ai_model_id,version,step) values('${ids.privateModel}','private-v1',1)`);
    ids.evaluation = psql(`insert into evaluation_runs(model_checkpoint_id,benchmark_task_id,simulation_scenario_id,requested_by,target_mode,status,outcome,trial_count,success_count,metrics) values('${ids.checkpoint}','${ids.task}','${ids.scenario}','${student}','simulation','succeeded','passed',10,8,'{"success_rate":0.8}') returning id`);
  });

  test.afterAll(() => {
    psql(`delete from role_permissions where permission_id=(select id from permissions where code='model.use') and role_id=(select id from roles where code='student' limit 1)`);
    psql(`delete from evaluation_runs where id='${ids.evaluation}'`);
    psql(`delete from model_checkpoints where ai_model_id in ('${ids.publicModel}','${ids.privateModel}')`);
    psql(`delete from ai_models where id in ('${ids.publicModel}','${ids.privateModel}')`);
    psql(`delete from training_runs where id='${ids.train}'`);
    psql(`delete from dataset_versions where id='${ids.dataset}'`);
    psql(`delete from simulation_scenarios where id='${ids.scenario}'`);
    psql(`delete from benchmark_tasks where id='${ids.task}'`);
  });

  async function overflow(page: Page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }

  test('System Admin reaches the registry from the sidebar, sees every model with its versions and metrics, and is told honestly what lineage is not visible', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await loadFixture(); await signIn(page, fixture, 'admin');
    await page.goto('/admin/organizations');
    await page.getByRole('navigation').getByRole('link', { name: 'AI models & data' }).first().click();
    await expect(page).toHaveURL(/\/ai-registry$/);
    await expect(page.getByRole('heading', { name: 'AI models & data' })).toBeVisible();
    await expect(page.getByText(/does not run model inference/)).toBeVisible();
    const publicCard = page.getByRole('listitem').filter({ hasText: PUBLIC });
    await expect(publicCard).toBeVisible();
    await expect(page.getByRole('listitem').filter({ hasText: PRIVATE })).toBeVisible();     // a System Admin sees private models too
    await publicCard.getByRole('button', { name: 'Show versions and lineage' }).click();
    await expect(publicCard.getByText(`Version v2-${run} · step 4000`)).toBeVisible();
    await expect(publicCard.getByText('Source vista/pnp@abc123')).toBeVisible();
    await expect(publicCard.getByText(/success rate: 0\.8/)).toBeVisible();
    await expect(publicCard.getByText('nested')).toHaveCount(0);                            // stored nested values are not flattened or invented
    await publicCard.getByRole('button', { name: 'Show training data' }).click();
    await expect(publicCard.getByText(/not visible to your account/)).toBeVisible();        // the run belongs to a student: lineage is scoped, not leaked
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test('a Student without model.use gets an honest "not available" Models tab but still sees their own datasets, training and evaluations', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'student');
    expect((await call(page, token, 'GET', '/ai-models')).status).toBe(404);
    await page.goto('/ai-registry');
    await expect(page.getByText('AI models are not available to your account')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);                                    // not an error: the account simply has no access
    await expect(page.getByText(PUBLIC)).toHaveCount(0);
    await page.getByRole('tab', { name: 'Datasets' }).click();
    const dataset = page.getByRole('listitem').filter({ hasText: `Demos ${run}` });
    await expect(dataset).toContainText('Frozen'); await expect(dataset).toContainText('Source vista/demos@r9'); await expect(dataset).toContainText('source: simulation · episodes: 30');
    await page.getByRole('tab', { name: 'Training & evaluation' }).click();
    await expect(page.getByText(`act-${run}`)).toBeVisible(); await expect(page.getByText('loss: 0.12')).toBeVisible();
    await expect(page.getByText('8 of 10 trials succeeded')).toBeVisible();
  });

  test('a Student who has been granted model.use sees only public models and the lineage of a run they own', async ({ page }) => {
    test.setTimeout(120_000);
    psql(`insert into permissions(code) values('model.use') on conflict (code) do nothing`);
    psql(`insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r, permissions p where r.code='student' and p.code='model.use' on conflict do nothing`);
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'student');
    const api = await call(page, token, 'GET', '/ai-models');
    expect(api.status).toBe(200);
    const names = (api.body.items as Array<{ name: string }>).map((m) => m.name);
    expect(names).toContain(PUBLIC); expect(names).not.toContain(PRIVATE);                   // private models stay private
    await page.goto('/ai-registry');
    const card = page.getByRole('listitem').filter({ hasText: PUBLIC });
    await expect(card).toBeVisible(); await expect(page.getByText(PRIVATE)).toHaveCount(0);
    await card.getByRole('button', { name: 'Show versions and lineage' }).click();
    await card.getByRole('button', { name: 'Show training data' }).click();
    await expect(card.getByText(`Demos ${run}`)).toBeVisible(); await expect(card.getByText(/vista\/demos@r9/)).toBeVisible();
    // it is read-only: nothing on the page writes
    expect((await call(page, token, 'POST', '/ai-models', { name: 'x' })).status).toBeGreaterThanOrEqual(400);
  });

  test('School Admin has no registry entry and cannot open the page', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'schoolAdmin');
    await page.goto('/school');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'AI models & data' })).toHaveCount(0);
    await page.goto('/ai-registry');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect(new URL(page.url()).pathname).not.toBe('/ai-registry');
  });
});
