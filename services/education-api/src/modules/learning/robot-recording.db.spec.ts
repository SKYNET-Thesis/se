import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { createDb, createWorld, describeDb, type Db } from './db-test-support';
import { RECORDING_SCHEMA, objectKey } from './robot-recording.contract';
import { RecordingRejectedError, RobotRecordingService } from './robot-recording.service';

/**
 * Robot Recordings against real PostgreSQL: the episode consumer registers evidence once (also under concurrency), only for a real-robot run of the
 * right robot, and only the owning student sees and can fetch it. Storage is an in-memory stand-in for the private bucket.
 */
describeDb('Robot recordings (PostgreSQL)', () => {
  const db: Db = createDb();
  const objects = new Map<string, { contentLength: number; sha256: string }>();
  let manifests = new Map<string, unknown>();
  const storage = {
    enabled: () => true,
    readManifest: async (key: string) => manifests.get(key) ?? null,
    head: async (key: string) => objects.get(key) ?? null,
    download: async (key: string) => `https://signed.example/${key}`,
    createUpload: async (key: string) => ({ url: 'https://bucket.example', fields: { key } }),
    createManifestUpload: async (key: string) => ({ url: 'https://bucket.example', fields: { key } }),
  };
  const service = new RobotRecordingService(db as never, storage as never);
  const SHA = 'd'.repeat(64);
  beforeAll(async () => { await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });

  async function run(kind: 'real_robot' | 'schematic' = 'real_robot') {
    const world = await createWorld(db);
    const role = await db.roles.upsert({ where: { code: 'student' }, update: {}, create: { code: 'student', name: 'Student', scope: 'organization' } });
    const user = await db.users.create({ data: { full_name: 'Rec', signup_method: 'admin_created', status: 'active' } });
    const membership = await db.memberships.create({ data: { user_id: user.id, organization_id: world.org.id, role_id: role.id, status: 'active' } });
    const robot = await db.robots.create({ data: { name: `R-${randomUUID().slice(0, 6)}`, serial_no: `S-${randomUUID()}`, model_name: 'SO-101', status: 'available' } });
    const mode = await db.control_modes.upsert({ where: { code: 'blockly' }, update: {}, create: { code: 'blockly', description: 'test' } });
    const profile = await db.safety_profiles.create({ data: { name: `p-${randomUUID()}`, max_speed_pct: 1, workspace_limit: {}, max_session_minutes: 2, allowed_modes: ['blockly'] } });
    const session = await db.control_sessions.create({ data: { organization_id: world.org.id, membership_id: membership.id, robot_id: robot.id, mode_id: mode.id, safety_profile_id: profile.id } });
    const experiment = await db.learning_experiments.create({ data: { learner_user_id: user.id, method: 'blockly', execution_mode: kind, control_session_id: session.id, input_snapshot: { robotId: robot.id } } });
    const asUser = { authUserId: 'a', vistaUserId: user.id, email: 'r@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] } as never;
    return { experiment, robot, user, asUser };
  }

  /** An episode whose files are already in the bucket, with its manifest written last. */
  function episode(robotId: string, experimentId: string, names = ['trajectory.ndjson', 'front.mp4']) {
    const episodeId = randomUUID();
    const files = names.map((name) => ({ name, sizeBytes: 500, sha256: SHA, contentType: name.endsWith('.mp4') ? 'video/mp4' : 'application/x-ndjson', artifactType: name.endsWith('.mp4') ? 'video' : 'trajectory' }));
    for (const file of files) objects.set(objectKey(robotId, experimentId, episodeId, file.name), { contentLength: 500, sha256: SHA });
    const manifestKey = objectKey(robotId, experimentId, episodeId, 'manifest.json');
    manifests.set(manifestKey, { schema: RECORDING_SCHEMA, episodeId, robotId, experimentId, startedAtMs: 1000, endedAtMs: 2000, declaredRuntimeKind: 'MOCK_RUNTIME', files });
    return { episodeId, manifestKey, files };
  }
  const artifacts = (experimentId: string) => db.learning_experiment_artifacts.count({ where: { experiment_id: experimentId } });

  it('registers each file as evidence of the run, once, with the declared runtime marked unverified', async () => {
    const { experiment, robot, asUser } = await run();
    const e = episode(robot.id, experiment.id);
    await expect(service.register(e.manifestKey)).resolves.toBe('registered');
    expect(await artifacts(experiment.id)).toBe(2);
    const rows = await db.learning_experiment_artifacts.findMany({ where: { experiment_id: experiment.id }, orderBy: { storage_path: 'asc' } });
    expect(rows.map((r) => r.artifact_type).sort()).toEqual(['trajectory', 'video']);
    expect(rows[0].metadata).toMatchObject({ schema: RECORDING_SCHEMA, episodeId: e.episodeId, declaredRuntimeKind: 'MOCK_RUNTIME', runtimeVerified: false });
    expect(await db.learning_experiment_events.count({ where: { experiment_id: experiment.id, event_type: 'robot_recording_registered' } })).toBe(1);
    const listed = await service.list(asUser, experiment.id);
    expect(listed).toHaveLength(2);
    expect(listed.every((r: { availability: string; runtimeVerified: boolean }) => r.availability === 'available' && r.runtimeVerified === false)).toBe(true);
  });

  it('is idempotent, including when the same manifest is delivered concurrently', async () => {
    const { experiment, robot } = await run();
    const e = episode(robot.id, experiment.id);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.register(e.manifestKey)));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(results.filter((r) => r.status === 'fulfilled' && r.value === 'registered')).toHaveLength(1);
    expect(await artifacts(experiment.id)).toBe(2);
    expect(await db.learning_experiment_events.count({ where: { experiment_id: experiment.id, event_type: 'robot_recording_registered' } })).toBe(1);
    await expect(service.register(e.manifestKey)).resolves.toBe('duplicate');
    expect(await artifacts(experiment.id)).toBe(2);
  });

  it('refuses a schematic run, another robot, and an unknown run, and registers nothing', async () => {
    const sim = await run('schematic');
    await expect(service.register(episode(sim.robot.id, sim.experiment.id).manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    const a = await run(); const b = await run();
    await expect(service.register(episode(b.robot.id, a.experiment.id).manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);   // the robot did not run this experiment
    await expect(service.register(episode(a.robot.id, randomUUID()).manifestKey)).rejects.toBeInstanceOf(RecordingRejectedError);
    expect(await artifacts(sim.experiment.id) + await artifacts(a.experiment.id) + await artifacts(b.experiment.id)).toBe(0);
  });

  it('shows and releases a recording only to the student who owns the run', async () => {
    const owner = await run(); const other = await run();
    const e = episode(owner.robot.id, owner.experiment.id); await service.register(e.manifestKey);
    expect(await service.list(other.asUser, owner.experiment.id)).toEqual([]);
    const [artifact] = await db.learning_experiment_artifacts.findMany({ where: { experiment_id: owner.experiment.id } });
    await expect(service.download(other.asUser, owner.experiment.id, artifact.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.download(owner.asUser, owner.experiment.id, artifact.id)).resolves.toMatchObject({ url: expect.stringContaining(artifact.storage_path as string), expiresInSeconds: 300 });
  });

  it('authorises uploads only for the owner, only for a real-robot run, and only inside the 24-hour window', async () => {
    const { experiment, robot, asUser } = await run(); const other = await run(); const sim = await run('schematic');
    const body = { episodeId: randomUUID(), files: [{ name: 'a.ndjson', sizeBytes: 10, sha256: SHA, contentType: 'application/x-ndjson', artifactType: 'trajectory' }] };
    const ok = await service.authorizeUpload(asUser, experiment.id, body);
    expect(ok.uploads[0].key.startsWith(`episodes/${robot.id}/${experiment.id}/`)).toBe(true);
    await expect(service.authorizeUpload(other.asUser, experiment.id, body)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.authorizeUpload(sim.asUser, sim.experiment.id, body)).rejects.toBeInstanceOf(NotFoundException);
    await db.$executeRaw`UPDATE public.learning_experiments SET created_at = now() - interval '25 hours' WHERE id = ${experiment.id}::uuid`;
    await expect(service.authorizeUpload(asUser, experiment.id, body)).rejects.toBeInstanceOf(NotFoundException);
  });
});
