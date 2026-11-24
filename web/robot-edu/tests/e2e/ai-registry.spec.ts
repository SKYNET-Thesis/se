import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { call, loadFixture, signIn } from './helpers/academic';

/**
 * SRS FR-08 / UC-08 and the approved visibility policy, in the real browser against the real API and PostgreSQL:
 * Student, Teacher and System Admin read PUBLIC model metadata. Public visibility never grants model.use, private or entitled-private
 * models, owner references, unreleased datasets or artifact locations, and it stops at the tenant boundary.
 * Seeded rows are disposable; the model.use grant used for the "wider view" case is removed again.
 */
const run = Date.now().toString(36).toUpperCase();
const psql = (sql: string) => execFileSync('psql', [process.env.VISTA_E2E_ADMIN_DATABASE_URL!, '-Atqc', sql], { encoding: 'utf8' }).trim().split('\n')[0];
const PUBLIC = `Registry public ${run}`; const PRIVATE = `Registry private ${run}`; const ENTITLED = `Registry entitled ${run}`; const MINE = `Registry mine ${run}`;
const ids: Record<string, string> = {};
const names = (items: Array<{ name: string }>) => items.map((m) => m.name).filter((n) => n.endsWith(run)).sort();
const FORBIDDEN = /owner_user_id|owner_organization_id|artifact_uri|secret-weights|private-bucket|camera-serial|provenance/;

test.describe.serial('AI model & dataset registry (public visibility policy)', () => {
  test.beforeAll(async () => {
    const fixture = await loadFixture(); const student = fixture.users.student.userId;
    ids.task = psql(`insert into benchmark_tasks(code,name,object_type,target_container,pass_criterion) values('BT-${run}','Pick cube ${run}','cube','box','cube inside the box') returning id`);
    ids.scenario = psql(`insert into simulation_scenarios(benchmark_task_id,name,version,engine) values('${ids.task}','Scenario ${run}',1,'mujoco') returning id`);
    ids.frozen = psql(`insert into dataset_versions(created_by,name,version,huggingface_repo,huggingface_revision,provenance,is_frozen) values('${student}','Demos ${run}','v1','vista/demos','r9','{"source":"simulation","note":"camera-serial-123"}',true) returning id`);
    ids.open = psql(`insert into dataset_versions(created_by,name,version,is_frozen) values('${student}','Draft demos ${run}','v2',false) returning id`);
    ids.trainFrozen = psql(`insert into training_runs(dataset_version_id,requested_by,policy_name,status,compute_source,metrics) values('${ids.frozen}','${student}','act-${run}','succeeded','local','{"loss":0.12}') returning id`);
    ids.trainOpen = psql(`insert into training_runs(dataset_version_id,requested_by,policy_name,status) values('${ids.open}','${student}','draft-${run}','succeeded') returning id`);
    const model = (name: string, extra = "'system',null,'private'") => psql(`insert into ai_models(name,description,owner_type,owner_user_id,visibility,status) values('${name}','Card of ${name}',${extra},'active') returning id`);
    ids.publicModel = model(PUBLIC, "'system',null,'public'");
    ids.privateModel = model(PRIVATE);
    ids.entitledModel = model(ENTITLED);
    ids.mineModel = model(MINE, `'developer','${student}','private'`);
    const checkpoint = (modelId: string, version: string, trainingRun = 'null') => psql(`insert into model_checkpoints(ai_model_id,training_run_id,version,step,huggingface_repo,huggingface_revision,artifact_uri,metrics) values('${modelId}',${trainingRun === 'null' ? 'null' : `'${trainingRun}'`},'${version}',4000,'vista/pnp','abc123','s3://private-bucket/secret-weights.bin','{"success_rate":0.8,"nested":{"x":1}}') returning id`);
    ids.cpFrozen = checkpoint(ids.publicModel, `v2-${run}`, ids.trainFrozen);
    ids.cpOpen = checkpoint(ids.publicModel, `v1-${run}`, ids.trainOpen);
    ids.cpPrivate = checkpoint(ids.privateModel, 'private-1');
    ids.cpEntitled = checkpoint(ids.entitledModel, 'entitled-1');
    ids.cpMine = checkpoint(ids.mineModel, 'mine-1');
    ids.evaluation = psql(`insert into evaluation_runs(model_checkpoint_id,benchmark_task_id,simulation_scenario_id,requested_by,target_mode,status,outcome,trial_count,success_count,metrics) values('${ids.cpFrozen}','${ids.task}','${ids.scenario}','${student}','simulation','succeeded','passed',10,8,'{"success_rate":0.8}') returning id`);
    // the student's school is entitled to a private model: that is still not part of the public registry
    ids.entitlement = psql(`insert into org_entitlements(organization_id,resource_type,ai_model_id) values('${fixture.schoolId}','model','${ids.entitledModel}') returning id`);
    psql(`insert into user_assignments(organization_id,membership_id,entitlement_id) select '${fixture.schoolId}',m.id,'${ids.entitlement}' from memberships m where m.user_id='${student}' and m.organization_id='${fixture.schoolId}'`);
  });

  test.afterAll(() => {
    psql(`delete from role_permissions where permission_id=(select id from permissions where code='model.use') and role_id=(select id from roles where code='student' limit 1)`);
    psql(`delete from user_assignments where entitlement_id='${ids.entitlement}'`);
    psql(`delete from org_entitlements where id='${ids.entitlement}'`);
    psql(`delete from evaluation_runs where id='${ids.evaluation}'`);
    psql(`delete from model_checkpoints where ai_model_id in ('${ids.publicModel}','${ids.privateModel}','${ids.entitledModel}','${ids.mineModel}')`);
    psql(`delete from ai_models where id in ('${ids.publicModel}','${ids.privateModel}','${ids.entitledModel}','${ids.mineModel}')`);
    psql(`delete from training_runs where id in ('${ids.trainFrozen}','${ids.trainOpen}')`);
    psql(`delete from dataset_versions where id in ('${ids.frozen}','${ids.open}')`);
    psql(`delete from simulation_scenarios where id='${ids.scenario}'`);
    psql(`delete from benchmark_tasks where id='${ids.task}'`);
  });

  const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  /** The shared checks for a Student or a Teacher: public only, no owner references, no artifact locations, nothing private or entitled. */
  async function publicReader(page: Page, who: 'student' | 'instructor') {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, who);
    const list = await call(page, token, 'GET', '/ai-models?page=1&pageSize=100');
    expect(list.status).toBe(200);
    expect(names(list.body.items)).toEqual([PUBLIC]);                                              // not private, not entitled, not owned
    expect(JSON.stringify(list.body)).not.toMatch(FORBIDDEN);
    for (const privateId of [ids.privateModel, ids.entitledModel, ids.mineModel]) {
      expect((await call(page, token, 'GET', `/ai-models/${privateId}`)).status).toBe(404);
      expect((await call(page, token, 'GET', `/ai-models/${privateId}/checkpoints`)).status).toBe(404);
    }
    for (const privateCheckpoint of [ids.cpPrivate, ids.cpEntitled, ids.cpMine]) {
      for (const suffix of ['', '/model', '/training-data']) expect((await call(page, token, 'GET', `/model-checkpoints/${privateCheckpoint}${suffix}`)).status).toBe(404);
    }
    const versions = await call(page, token, 'GET', `/ai-models/${ids.publicModel}/checkpoints`);
    expect(versions.status).toBe(200); expect(JSON.stringify(versions.body)).not.toMatch(FORBIDDEN);
    const lineage = await call(page, token, 'GET', `/model-checkpoints/${ids.cpFrozen}/training-data`);
    expect(lineage.status).toBe(200); expect(lineage.body).toMatchObject({ name: `Demos ${run}`, version: 'v1', is_frozen: true });
    expect(JSON.stringify(lineage.body)).not.toMatch(FORBIDDEN);
    expect((await call(page, token, 'GET', `/model-checkpoints/${ids.cpOpen}/training-data`)).status).toBe(404);   // an unreleased dataset is not public lineage
    expect([404, 405]).toContain((await call(page, token, 'POST', '/ai-models', { name: 'x' })).status);          // read-only
    // it never became model.use: the student's wider rows (own private model) stay hidden
    expect(names((await call(page, token, 'GET', '/ai-models?page=1&pageSize=100')).body.items)).not.toContain(MINE);

    await page.goto('/ai-registry');
    const card = page.getByRole('listitem').filter({ hasText: PUBLIC });
    await expect(card).toBeVisible();
    for (const hiddenName of [PRIVATE, ENTITLED, MINE]) await expect(page.getByText(hiddenName)).toHaveCount(0);
    await card.getByRole('button', { name: 'Show versions and lineage' }).click();
    await expect(card.getByText(`Version v2-${run} · step 4000`)).toBeVisible();
    await expect(card.getByText('Source vista/pnp@abc123').first()).toBeVisible();   // both versions share the source and metrics
    await expect(card.getByText(/success rate: 0\.8/).first()).toBeVisible();
    await expect(card.getByText('nested')).toHaveCount(0);
    const versionRow = (version: string) => card.getByRole('list', { name: 'Model versions' }).getByRole('listitem').filter({ hasText: `Version ${version}-${run}` });
    await versionRow('v2').getByRole('button', { name: 'Show training data' }).click();
    await expect(versionRow('v2').getByText(`Demos ${run}`)).toBeVisible(); await expect(versionRow('v2').getByText(/vista\/demos@r9/)).toBeVisible();
    await versionRow('v1').getByRole('button', { name: 'Show training data' }).click();
    await expect(versionRow('v1').getByText(/only released \(frozen\) dataset versions are shown/)).toBeVisible();
    expect(await page.locator('body').innerText()).not.toMatch(/secret-weights|private-bucket|camera-serial/);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }

  test('a Student reads public models without model.use: nothing private, entitled or owned, no owner references or artifact locations', async ({ page }) => {
    test.setTimeout(120_000); await publicReader(page, 'student');
  });

  test('a Teacher reads the same public view', async ({ page }) => {
    test.setTimeout(120_000); await publicReader(page, 'instructor');
  });

  test('a Student still sees their own datasets, training and evaluation runs in the other tabs', async ({ page }) => {
    const fixture = await loadFixture(); await signIn(page, fixture, 'student');
    await page.goto('/ai-registry');
    await page.getByRole('tab', { name: 'Datasets' }).click();
    const dataset = page.getByRole('listitem').filter({ hasText: new RegExp(`^Demos ${run}`) });   // not the "Draft demos" card
    await expect(dataset).toContainText('Frozen'); await expect(dataset).toContainText('source: simulation');
    await page.getByRole('tab', { name: 'Training & evaluation' }).click();
    await expect(page.getByText(`act-${run}`)).toBeVisible(); await expect(page.getByText('8 of 10 trials succeeded')).toBeVisible();
  });

  test('tenant boundary: a student of another school sees the same public models and nothing of this school’s private or entitled models', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'otherStudent');
    const list = await call(page, token, 'GET', '/ai-models?page=1&pageSize=100');
    expect(list.status).toBe(200); expect(names(list.body.items)).toEqual([PUBLIC]);
    for (const privateId of [ids.entitledModel, ids.mineModel, ids.privateModel]) expect((await call(page, token, 'GET', `/ai-models/${privateId}`)).status).toBe(404);
    expect((await call(page, token, 'GET', `/model-checkpoints/${ids.cpEntitled}`)).status).toBe(404);
    // and they cannot read this school's student-owned datasets or runs
    expect(JSON.stringify((await call(page, token, 'GET', '/me/dataset-versions')).body)).not.toContain(`Demos ${run}`);
    expect((await call(page, token, 'GET', `/me/evaluation-runs/${ids.evaluation}`)).status).toBe(404);
  });

  test('System Admin sees every model from the sidebar entry, with versions, metrics and the unreleased lineage', async ({ page }) => {
    test.setTimeout(120_000);
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'admin');
    expect(names((await call(page, token, 'GET', '/ai-models?page=1&pageSize=100')).body.items)).toEqual([ENTITLED, MINE, PRIVATE, PUBLIC].sort());
    expect((await call(page, token, 'GET', `/model-checkpoints/${ids.cpOpen}/training-data`)).status).toBe(200);
    await page.goto('/admin/organizations');
    await page.getByRole('navigation').getByRole('link', { name: 'AI models & data' }).first().click();
    await expect(page).toHaveURL(/\/ai-registry$/);
    await expect(page.getByRole('listitem').filter({ hasText: PRIVATE })).toBeVisible();
  });

  test('with model.use the wider view is unchanged: own and entitled private models appear, someone else’s private model still does not', async ({ page }) => {
    test.setTimeout(120_000);
    psql(`insert into permissions(code) values('model.use') on conflict (code) do nothing`);
    psql(`insert into role_permissions(role_id,permission_id) select r.id,p.id from roles r, permissions p where r.code='student' and p.code='model.use' on conflict do nothing`);
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'student');
    const list = await call(page, token, 'GET', '/ai-models?page=1&pageSize=100');
    expect(names(list.body.items)).toEqual([ENTITLED, MINE, PUBLIC].sort());
    expect((await call(page, token, 'GET', `/ai-models/${ids.privateModel}`)).status).toBe(404);
    const other = await signIn(page, fixture, 'otherStudent');
    expect(names((await call(page, other, 'GET', '/ai-models?page=1&pageSize=100')).body.items)).toEqual([PUBLIC]);   // tenant isolation holds with model.use too: no entitlement, no ownership, nothing extra
  });

  test('School Admin has no registry entry and no access; an anonymous caller is refused', async ({ page }) => {
    const fixture = await loadFixture(); const token = await signIn(page, fixture, 'schoolAdmin');
    expect((await call(page, token, 'GET', '/ai-models')).status).toBe(404);
    await page.goto('/school');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'AI models & data' })).toHaveCount(0);
    await page.goto('/ai-registry'); await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    expect(new URL(page.url()).pathname).not.toBe('/ai-registry');
    expect((await page.request.get(`${process.env.VISTA_E2E_API_BASE_URL}/ai-models`)).status()).toBe(401);
  });
});
