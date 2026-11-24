import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { createDb, describeDb, type Db } from '../learning/db-test-support';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { MetadataService } from './metadata.service';

/**
 * SRS UC-08 / FR-08 on real PostgreSQL: Student, Teacher and System Admin read public model metadata; public visibility never grants
 * model.use, private or entitled-private models, owner references, provenance blobs or artifact locations.
 */
describeDb('AI model registry access (PostgreSQL)', () => {
  const db: Db = createDb();
  const service = new MetadataService(db as never);
  const run = randomUUID().slice(0, 8);
  const page = { page: 1, pageSize: 100 };
  const ids: Record<string, string> = {};
  const caller = (userId: string, roleCode: string | null, over: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
    authUserId: 'a', vistaUserId: userId, email: `${roleCode ?? 'none'}@test`, status: 'active', systemRoleCodes: [], systemPermissions: [],
    memberships: roleCode ? [{ id: randomUUID(), organizationId: ids.org, roleCode, status: 'active', permissions: [] }] : [], ...over,
  });
  const visibleNames = async (user: AuthenticatedUser) => ((await service.models(user, page)).items as Array<{ name: string }>).map((m) => m.name).filter((n) => n.endsWith(run)).sort();
  const hidden = (promise: Promise<unknown>) => expect(promise).rejects.toBeInstanceOf(NotFoundException);

  beforeAll(async () => {
    await db.$connect();
    const user = async (label: string) => (await db.users.create({ data: { full_name: `${label} ${run}`, signup_method: 'admin_created', status: 'active' } })).id;
    for (const label of ['student', 'instructor', 'schoolAdmin', 'ta', 'stranger', 'owner']) ids[label] = await user(label);
    ids.org = (await db.organizations.create({ data: { name: `registry ${run}`, type: 'institution', segment: 'education' } })).id;
    const frozen = await db.dataset_versions.create({ data: { created_by: ids.owner, name: `Frozen demos ${run}`, version: 'v1', huggingface_repo: 'vista/demos', huggingface_revision: 'r9', is_frozen: true, provenance: { secret: 'camera-serial-123' }, split_definition: { train: 0.7 } } });
    const open = await db.dataset_versions.create({ data: { created_by: ids.owner, name: `Open demos ${run}`, version: 'v2', is_frozen: false } });
    const runOf = async (dataset: string) => (await db.training_runs.create({ data: { dataset_version_id: dataset, requested_by: ids.owner, policy_name: 'act', status: 'succeeded' } })).id;
    const model = async (name: string, data: Record<string, unknown>) => (await db.ai_models.create({ data: { name: `${name} ${run}`, owner_type: 'system', visibility: 'public', status: 'active', ...data } as never })).id;
    ids.pub = await model('Public', {});
    ids.priv = await model('Private', { visibility: 'private' });
    ids.entitled = await model('Entitled private', { visibility: 'private' });
    ids.mine = await model('Mine', { visibility: 'private', owner_type: 'developer', owner_user_id: ids.student });
    const checkpoint = async (modelId: string, version: string, trainingRun?: string) => (await db.model_checkpoints.create({ data: { ai_model_id: modelId, version, training_run_id: trainingRun ?? null, step: 10, huggingface_repo: 'vista/pnp', huggingface_revision: 'abc', artifact_uri: 's3://private-bucket/secret-weights.bin', metrics: { success_rate: 0.8 } } })).id;
    ids.cpPub = await checkpoint(ids.pub, 'v-frozen', await runOf(frozen.id));
    ids.cpPubOpen = await checkpoint(ids.pub, 'v-open', await runOf(open.id));
    ids.cpPriv = await checkpoint(ids.priv, 'v-private');
    ids.cpEntitled = await checkpoint(ids.entitled, 'v-entitled');
    ids.cpMine = await checkpoint(ids.mine, 'v-mine');
    // the student's school is entitled to the private model: it is still not part of the public registry
    const role = await db.roles.upsert({ where: { code: 'student' }, update: {}, create: { code: 'student', name: 'Student', scope: 'organization' } });
    const membership = await db.memberships.create({ data: { user_id: ids.student, organization_id: ids.org, role_id: role.id, status: 'active' } });
    const entitlement = await db.org_entitlements.create({ data: { organization_id: ids.org, resource_type: 'model', ai_model_id: ids.entitled } });
    await db.user_assignments.create({ data: { organization_id: ids.org, membership_id: membership.id, entitlement_id: entitlement.id } });
  });
  afterAll(async () => { await db.$disconnect(); });

  it.each([['student'], ['instructor']])('a %s sees the public model only, without owner references, and nothing private, owned or entitled', async (role) => {
    const user = caller(ids[role], role);
    expect(await visibleNames(user)).toEqual([`Public ${run}`]);
    const card = await service.model(user, ids.pub);
    expect(card).toMatchObject({ id: ids.pub, visibility: 'public' });
    expect(Object.keys(card)).not.toEqual(expect.arrayContaining(['owner_user_id']));
    expect(JSON.stringify(card)).not.toMatch(/owner_user_id|owner_organization_id/);
    for (const privateId of [ids.priv, ids.entitled, ids.mine]) await hidden(service.model(user, privateId));
    for (const privateId of [ids.priv, ids.entitled, ids.mine]) await hidden(service.modelCheckpoints(user, privateId));
    for (const checkpointId of [ids.cpPriv, ids.cpEntitled, ids.cpMine]) { await hidden(service.checkpoint(user, checkpointId)); await hidden(service.checkpointModel(user, checkpointId)); await hidden(service.checkpointTrainingData(user, checkpointId)); }
  });

  it('shows public versions with stored metrics and source, and never an artifact location', async () => {
    const user = caller(ids.student, 'student');
    const versions = await service.modelCheckpoints(user, ids.pub) as Array<Record<string, unknown>>;
    expect(versions.map((v) => v.version).sort()).toEqual(['v-frozen', 'v-open']);
    const one = await service.checkpoint(user, ids.cpPub);
    expect(one).toMatchObject({ version: 'v-frozen', huggingface_repo: 'vista/pnp', metrics: { success_rate: 0.8 } });
    for (const payload of [versions, one, await service.checkpointModel(user, ids.cpPub)]) expect(JSON.stringify(payload)).not.toMatch(/artifact_uri|secret-weights|private-bucket/);
  });

  it('exposes training-data lineage to a public reader only as released (frozen) dataset name, version and source', async () => {
    const user = caller(ids.student, 'student');
    const lineage = await service.checkpointTrainingData(user, ids.cpPub);
    expect(lineage).toMatchObject({ name: `Frozen demos ${run}`, version: 'v1', huggingface_repo: 'vista/demos', huggingface_revision: 'r9', is_frozen: true });
    expect(JSON.stringify(lineage)).not.toMatch(/camera-serial|provenance|split|organization|created_by/);
    await hidden(service.checkpointTrainingData(user, ids.cpPubOpen));                  // an unreleased dataset version is not part of the public lineage
    await hidden(service.checkpointTrainingData(user, ids.cpPriv));                     // no training run recorded
  });

  it('keeps the registry closed to School Admins, Teaching Assistants, people without a membership and suspended members', async () => {
    const closed = [caller(ids.schoolAdmin, 'school_admin'), caller(ids.ta, 'teaching_assistant'), caller(ids.stranger, null), caller(ids.student, 'student', { memberships: [{ id: 'm', organizationId: ids.org, roleCode: 'student', status: 'suspended', permissions: [] }] })];
    for (const user of closed) {
      await hidden(service.models(user, page)); await hidden(service.model(user, ids.pub)); await hidden(service.modelCheckpoints(user, ids.pub));
      await hidden(service.checkpoint(user, ids.cpPub)); await hidden(service.checkpointTrainingData(user, ids.cpPub));
    }
  });

  it('does not let public visibility act as model.use: a student with model.use keeps the existing wider view, one without it does not', async () => {
    const withoutUse = caller(ids.student, 'student');
    expect(withoutUse.memberships[0].permissions).not.toContain('model.use');
    expect(await visibleNames(withoutUse)).not.toContain(`Mine ${run}`);               // own private model needs model.use
    const withUse = caller(ids.student, 'student', { memberships: [{ id: randomUUID(), organizationId: ids.org, roleCode: 'student', status: 'active', permissions: ['model.use'] }] });
    expect(await visibleNames(withUse)).toEqual([`Entitled private ${run}`, `Mine ${run}`, `Public ${run}`].sort());   // owner and entitlement paths, unchanged
    await hidden(service.model(withUse, ids.priv));                                     // someone else's private model stays private
  });

  it('gives the System Administrator every model and the full rows', async () => {
    const admin = caller(ids.stranger, null, { systemPermissions: ['org.manage'] });
    expect(await visibleNames(admin)).toEqual([`Entitled private ${run}`, `Mine ${run}`, `Private ${run}`, `Public ${run}`].sort());
    expect(await service.model(admin, ids.mine)).toMatchObject({ owner_user_id: ids.student });
    expect(await service.checkpointTrainingData(admin, ids.cpPubOpen)).toMatchObject({ is_frozen: false });
  });
});
