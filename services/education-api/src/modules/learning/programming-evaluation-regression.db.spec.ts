import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { createDb, createStudent, createSystemAdmin, createWorld, describeDb, joinClassroom, type Db, type World } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { ExperimentService } from './experiment.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { ProgrammingService } from './programming.service';
import { ProgressionService } from './progression.service';
import { SchematicEngineService } from './schematic-engine.service';
import { SymbolicEvaluationPreparationService } from './symbolic-rules/symbolic-evaluation-preparation.service';
import { SymbolicEvaluationService } from './symbolic-rules/symbolic-evaluation.service';
import { SymbolicRuleCompilerService } from './symbolic-rules/symbolic-rule-compiler.service';
import { SymbolicRuleEvaluatorService } from './symbolic-rules/symbolic-rule-evaluator.service';

/**
 * L01-L03 regression suite on the disposable PostgreSQL database (guarded by db-test-support): ProgramVersion numbering,
 * program validation, the evaluate/submit orders for curriculum and teacher-created assignments, duplicates, authorization,
 * grade integrity, rollback and historical evaluator versions. Real services and real SQL; nothing is mocked.
 */
const waitProgram = { schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'wait', durationMs: 100 }] };
const armOnly = { schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'arm.select', arm: 'left' }] };
const waitWs = { blocks: [{ type: 'robot_wait' }] };
const armWs = { blocks: [{ type: 'robot_select_arm' }] };
const mv = (arm: string, x: number, y: number, z: number) => ({ type: 'preview.move_xyz', arm, frame: 'learning_preview_v1', mode: 'learning_preview', position: { x, y, z } });
const graspProgram = (arm: string) => ({ schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'arm.select', arm }, mv(arm, 120, 150, 40), { type: 'gripper.close' }, mv(arm, 120, 150, 100), { type: 'gripper.open' }] });

describeDb('L01-L03 programming evaluation regression (real PostgreSQL)', () => {
  jest.setTimeout(120_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let scope: LearningScopeService; let enrollments: EnrollmentDeliveryService; let learning: LearningService; let programming: ProgrammingService;
  let experiments: ExperimentService; let evaluation: SymbolicEvaluationService; let assessment: AssessmentService;

  beforeAll(async () => {
    await db.$connect();
    scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    const progression = new ProgressionService(db as never, scope);
    learning = new LearningService(db as never, scope, progression, enrollments);
    programming = new ProgrammingService(db as never, scope, progression);
    experiments = new ExperimentService(db as never, scope, new SchematicEngineService());
    assessment = new AssessmentService(db as never, scope);
    const evaluator = new SymbolicRuleEvaluatorService();
    evaluation = new SymbolicEvaluationService(db as never, new SymbolicEvaluationPreparationService(db as never, scope, new SymbolicRuleCompilerService(), evaluator), evaluator, progression);
  });
  afterAll(async () => { await db.$disconnect(); });

  type Kind = 'curriculum' | 'teacher';
  async function fixture(kind: Kind, options: { allowed?: string[]; condition?: { rule_key: string; rule_config: Record<string, unknown> } } = {}) {
    const x: World = await createWorld(db);
    const challenge = await db.learning_challenges.create({ data: { title: 'Wait', status: 'published' } as never });
    const condition = options.condition ?? { rule_key: 'action_present', rule_config: { action: 'wait' } };
    await db.learning_challenge_conditions.create({ data: { challenge_id: challenge.id, ordinal: 1, condition_type: 'success', ...condition } as never });
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, challenge_id: challenge.id, title: 'T', instructions: 'i',
      allowed_blocks: options.allowed ?? ['wait', 'arm.select'], constraints: kind === 'curriculum' ? { kind: 'symbolic_program' } : {} } });
    const criterion = await db.learning_rubric_criteria.create({ data: { assignment_id: assignment.id, title: 'Safety', max_points: 10, ordinal: 1 } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status: 'published' } });
    const permission = await db.permissions.upsert({ where: { code: 'learning.experiment.execute' }, update: {}, create: { code: 'learning.experiment.execute' } });
    await db.$executeRaw`INSERT INTO public.role_permissions(role_id,permission_id) VALUES(${x.role.id}::uuid,${permission.id}::uuid) ON CONFLICT DO NOTHING`;
    const asUser = (st: Awaited<ReturnType<typeof createStudent>>, x2: World, permissions = ['learning.work.write', 'learning.experiment.execute']) => ({ authUserId: 'a', vistaUserId: st.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: st.membership.id, organizationId: x2.org.id, roleCode: 'student', status: 'active', permissions }] }) as never;
    const student = async () => { const st = await createStudent(db, x); await joinClassroom(db, st, x.room.id); return st; };
    const s = await student(); const classmate = await student(); const noExecute = await student();
    await enrollments.synchronizeClassroom(x.room.id);
    // another school entirely
    const x2: World = await createWorld(db); const outsider = await createStudent(db, x2); await joinClassroom(db, outsider, x2.room.id);
    return { x, challenge, assignment, criterion, delivery, user: asUser(s, x), s, classmate: asUser(classmate, x), noExecute: asUser(noExecute, x, ['learning.work.write']),
      outsider: asUser(outsider, x2), teacher: await createSystemAdmin(db), kind };
  }
  type Fx = Awaited<ReturnType<typeof fixture>>;

  const start = async (f: Fx, program: Record<string, unknown> = waitProgram, ws: Record<string, unknown> = waitWs) => {
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    const p = await programming.createProgram(f.user, attempt.id, { title: 'P', workspaceJson: ws, robotProgram: program });
    return { attempt, p };
  };
  type Version = { id: string; version_number: number; workspace_json: unknown; robot_program: unknown };
  const version = (f: Fx, p: { id: string }, summary: string) => programming.createVersion(f.user, p.id, { changeSummary: summary }) as Promise<Version>;
  const runExperiment = async (f: Fx, attemptId: string, versionId: string) => {
    const e = await experiments.create(f.user, attemptId, { programVersionId: versionId, executionMode: 'schematic' } as never) as { id: string };
    await experiments.runSchematic(f.user, e.id);
    return e.id;
  };
  const evaluate = (f: Fx, experimentId: string) => evaluation.evaluateOwnExperiment(f.user, experimentId) as Promise<Record<string, any>>;
  const attemptRow = (id: string) => db.learning_assignment_attempts.findUniqueOrThrow({ where: { id } });
  const evalCount = (f: Fx) => db.learning_symbolic_evaluations.count({ where: { requested_by_user_id: (f.user as { vistaUserId: string }).vistaUserId } });
  const md5 = async (table: 'learning_submissions' | 'learning_assessments', column: string, id: string) =>
    ((await db.$queryRawUnsafe(`SELECT md5(t::text) AS h FROM public.${table} t WHERE ${column}=$1::uuid ORDER BY 1`, id)) as Array<{ h: string }>).map((r) => r.h);
  const lessonCompleted = (f: Fx) => db.learning_lesson_progress.count({ where: { learner_user_id: (f.user as { vistaUserId: string }).vistaUserId, status: 'completed' } });
  const outcome = (p: Promise<unknown>) => p.then(() => 'OK', (e: { constructor: { name: string }; response?: { code?: string } }) => `${e.constructor.name}${e.response?.code ? `:${e.response.code}` : ''}`);

  // ---------------------------------------------------------------- L01
  describe('L01 ProgramVersion numbering and consistency', () => {
    it('numbers versions consecutively, and the evaluated number equals the persisted version, the result snapshot and the read APIs', async () => {
      const f = await fixture('curriculum'); const a = await start(f);
      const v1 = await version(f, a.p, 'v1'); const v2 = await version(f, a.p, 'v2'); const v3 = await version(f, a.p, 'v3');
      expect([v1, v2, v3].map((v) => v.version_number)).toEqual([1, 2, 3]);

      const experimentId = await runExperiment(f, a.attempt.id, v2.id); // evaluate an OLDER version on purpose
      const result = await evaluate(f, experimentId);
      const persisted = await db.learning_program_versions.findUniqueOrThrow({ where: { id: v2.id } });
      const snapshot = (await attemptRow(a.attempt.id)).result_snapshot as Record<string, any>;
      const fetched = await evaluation.own(f.user, result.id) as Record<string, any>;
      const listed = (await evaluation.mine(f.user) as Array<Record<string, any>>).find((e) => e.id === result.id)!;

      expect(persisted.version_number).toBe(2);
      expect(result.programVersionId).toBe(v2.id);
      expect(result.versionNumber).toBe(persisted.version_number);
      expect(result.evidence.versionNumber).toBe(persisted.version_number);
      expect(snapshot.evidence).toMatchObject({ evaluationId: result.id, programVersionId: v2.id, versionNumber: persisted.version_number });
      expect(fetched.versionNumber).toBe(persisted.version_number);
      expect(listed.versionNumber).toBe(persisted.version_number);
    });

    it('keeps the version history consistent and immutable while later versions are added', async () => {
      const f = await fixture('curriculum'); const a = await start(f);
      const v1 = await version(f, a.p, 'v1');
      const before = await md5('learning_submissions', 'program_id', a.p.id); // no submission yet
      await programming.updateProgram(f.user, a.p.id, { title: 'edited', robotProgram: { ...waitProgram, steps: [{ type: 'wait', durationMs: 250 }] } });
      const v2 = await version(f, a.p, 'v2');
      const history = await programming.versions(f.user, a.p.id) as Array<Version>;
      expect(history.map((v) => v.version_number)).toEqual([2, 1]);
      expect(history.find((v) => v.id === v1.id)!.robot_program).toEqual(waitProgram); // v1 did not change when the draft was edited
      expect(history.find((v) => v.id === v2.id)!.robot_program).toEqual({ ...waitProgram, steps: [{ type: 'wait', durationMs: 250 }] });
      expect(await md5('learning_submissions', 'program_id', a.p.id)).toEqual(before);
    });

    it('the submitted submission freezes exactly the chosen version and its numbering', async () => {
      const f = await fixture('curriculum'); const a = await start(f);
      await version(f, a.p, 'v1'); const v2 = await version(f, a.p, 'v2');
      const sub = await programming.submit(f.user, a.attempt.id, { programVersionId: v2.id }) as Record<string, any>;
      const row = await db.learning_submissions.findUniqueOrThrow({ where: { id: sub.id } });
      expect(row.program_version_id).toBe(v2.id);
      expect(row.submitted_program).toEqual(v2.robot_program);
      expect((await db.learning_program_versions.findUniqueOrThrow({ where: { id: row.program_version_id! } })).version_number).toBe(2);
    });
  });

  describe('L01 program validation (backend contract used by Blockly autosave)', () => {
    const previewProgram = (x: number, y: number, z: number) => ({ schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'arm.select', arm: 'left' }, mv('left', x, y, z)] });
    const previewWs = { blocks: [{ type: 'robot_select_arm' }, { type: 'robot_move_to' }] };
    const accepted = (f: Fx, attemptId: string, program: unknown) => programming.createProgram(f.user, attemptId, { title: 'P', workspaceJson: previewWs, robotProgram: program as never }).then(() => 'OK', (e: Error) => `${e.constructor.name}: ${e.message}`);

    it.each([[0, 0, 10], [600, 400, 300], [240, 220, 120]])('accepts the whole-millimetre coordinates (%p, %p, %p), including both bounds', async (x, y, z) => {
      const f = await fixture('teacher', { allowed: ['arm.select', 'preview.move_xyz'] });
      const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
      expect(await accepted(f, attempt.id, previewProgram(x, y, z))).toBe('OK');
    });

    it.each([
      ['a decimal x', [240.5, 220, 120], /integer x\/y\/z/],
      ['a decimal z', [240, 220, 120.25], /integer x\/y\/z/],
      ['x below range', [-1, 220, 120], /bounds/],
      ['x above range', [601, 220, 120], /bounds/],
      ['y below range', [240, -1, 120], /bounds/],
      ['y above range', [240, 401, 120], /bounds/],
      ['z below range', [240, 220, 9], /bounds/],
      ['z above range', [240, 220, 301], /bounds/],
    ])('rejects %s with a clear 400 and saves nothing', async (_label, [x, y, z], message) => {
      const f = await fixture('teacher', { allowed: ['arm.select', 'preview.move_xyz'] });
      const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
      const result = await accepted(f, attempt.id, previewProgram(x as number, y as number, z as number));
      expect(result).toMatch(/^BadRequestException: /); expect(result).toMatch(message as RegExp);
      expect((await attemptRow(attempt.id)).program_id).toBeNull();
    });

    it('does not weaken the other checks (unknown action, wrong schema, out-of-lesson action, negative wait)', async () => {
      const f = await fixture('curriculum'); const a = await start(f);
      const bad = (program: unknown) => outcome(programming.updateProgram(f.user, a.p.id, { robotProgram: program as never }));
      expect(await bad({ schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'fly' }] })).toBe('BadRequestException');
      expect(await bad({ schemaVersion: 2, kind: 'robot_program', steps: [] })).toBe('BadRequestException');
      expect(await bad({ schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'gripper.close' }] })).toBe('BadRequestException'); // not an allowed block for this lesson
      expect(await bad({ schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'wait', durationMs: -5 }] })).toBe('BadRequestException');
      expect(await bad({ schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'preview.move_xyz', mode: 'learning_preview', frame: 'learning_preview_v1', arm: 'left', position: { x: 1, y: 1, z: 20 } }] })).toBe('BadRequestException');
    });
  });

  // ---------------------------------------------------------------- L02
  describe('L02 evaluation: failed, retry, history and evaluator rules end to end', () => {
    it('a failed run records evidence without progression, a retry adds a second evaluation, and the history keeps both', async () => {
      const f = await fixture('curriculum'); const a = await start(f, armOnly, armWs);
      const v1 = await version(f, a.p, 'arm only');
      const failed = await evaluate(f, await runExperiment(f, a.attempt.id, v1.id));
      expect(failed).toMatchObject({ verdict: 'failed', status: 'failed', evaluatorVersion: 'vista-symbolic-evaluator-2', progression: { completedLessonId: null } });
      expect(failed.ruleResults[0]).toMatchObject({ code: 'ACTION_MISSING' });
      expect((await attemptRow(a.attempt.id)).status).toBe('in_progress');

      await programming.updateProgram(f.user, a.p.id, { workspaceJson: waitWs, robotProgram: waitProgram });
      const v2 = await version(f, a.p, 'fixed');
      const passed = await evaluate(f, await runExperiment(f, a.attempt.id, v2.id));
      expect(passed.verdict).toBe('passed');
      const history = await evaluation.mine(f.user) as Array<Record<string, any>>;
      expect(history.map((h) => [h.versionNumber, h.verdict]).sort()).toEqual([[1, 'failed'], [2, 'passed']]);
      expect(await lessonCompleted(f)).toBe(0); // a simulation run never completes the lesson; only the final submission does
    });

    it('the arm rule is enforced through the real flow: a right-arm program FAILS arm=left, the left-arm program PASSES', async () => {
      const f = await fixture('teacher', { allowed: ['arm.select', 'preview.move_xyz', 'gripper.close', 'gripper.open'], condition: { rule_key: 'object_grasped', rule_config: { arm: 'left' } } });
      const right = await start(f, graspProgram('right')); const rv = await version(f, right.p, 'right');
      const wrong = await evaluate(f, await runExperiment(f, right.attempt.id, rv.id));
      expect(wrong.verdict).toBe('failed');
      expect(wrong.ruleResults[0]).toMatchObject({ passed: false, code: 'OBJECT_GRASPED_BY_OTHER_ARM' });
      expect(wrong.feedback.summary).toContain('requires the left arm');
      await programming.updateProgram(f.user, right.p.id, { robotProgram: graspProgram('left') as never }); // same attempt: switch the program to the left arm
      const lv = await version(f, right.p, 'left');
      const right2 = await evaluate(f, await runExperiment(f, right.attempt.id, lv.id));
      expect(right2.verdict).toBe('passed');
      expect(right2.ruleResults[0]).toMatchObject({ passed: true, code: 'OBJECT_GRASPED' });
    });

    it('historical evaluator versions: an old (v1) evaluation stays untouched and readable; a re-evaluation adds a v2 row beside it', async () => {
      const f = await fixture('curriculum'); const a = await start(f);
      const v1 = await version(f, a.p, 'v1');
      const experimentId = await runExperiment(f, a.attempt.id, v1.id);
      const exp = await db.learning_experiments.findUniqueOrThrow({ where: { id: experimentId } });
      const legacyId = randomUUID();
      await db.$executeRaw`
        INSERT INTO public.learning_symbolic_evaluations(id,experiment_id,submission_id,program_version_id,requested_by_user_id,evaluator_version,schematic_schema_version,schematic_engine_version,
          program_hash,output_snapshot_hash,rule_set_schema_version,rule_set_hash,rule_set_snapshot,fingerprint,verdict,rule_results,metrics)
        VALUES(${legacyId}::uuid,${experimentId}::uuid,${exp.submission_id}::uuid,${v1.id}::uuid,${(f.user as { vistaUserId: string }).vistaUserId}::uuid,'vista-symbolic-evaluator-1',1,'vista-schematic-1','h','h',1,'h','{}'::jsonb,${randomUUID()},'passed','[]'::jsonb,'{}'::jsonb)`;
      const legacyBefore = ((await db.$queryRaw`SELECT md5(e::text) AS h FROM public.learning_symbolic_evaluations e WHERE id=${legacyId}::uuid`) as Array<{ h: string }>)[0].h;

      const fresh = await evaluate(f, experimentId);
      expect(fresh.id).not.toBe(legacyId);
      expect(fresh.evaluatorVersion).toBe('vista-symbolic-evaluator-2');
      const legacy = await evaluation.own(f.user, legacyId) as Record<string, any>;
      expect(legacy).toMatchObject({ evaluatorVersion: 'vista-symbolic-evaluator-1', verdict: 'passed' });
      expect(((await db.$queryRaw`SELECT md5(e::text) AS h FROM public.learning_symbolic_evaluations e WHERE id=${legacyId}::uuid`) as Array<{ h: string }>)[0].h).toBe(legacyBefore);
      const versions = (await evaluation.mine(f.user) as Array<Record<string, any>>).map((e) => e.evaluatorVersion).sort();
      expect(versions).toEqual(['vista-symbolic-evaluator-1', 'vista-symbolic-evaluator-2']);
    });
  });

  // ---------------------------------------------------------------- L03
  describe('L03 teacher-created assignment: evaluate and submit in either order', () => {
    it('Evaluate -> Submit: submits as evaluated, records evidence, completes no curriculum lesson', async () => {
      const f = await fixture('teacher'); const a = await start(f); const v = await version(f, a.p, 'v1');
      const result = await evaluate(f, await runExperiment(f, a.attempt.id, v.id));
      expect(result).toMatchObject({ verdict: 'passed', progression: { completedLessonId: null } });
      expect((await attemptRow(a.attempt.id)).status).toBe('in_progress');
      const sub = await programming.submit(f.user, a.attempt.id, { programVersionId: v.id }) as Record<string, any>;
      expect(sub).toMatchObject({ status: 'submitted', evaluated: true, progression: { completedLessonId: null } });
      expect((await attemptRow(a.attempt.id)).status).toBe('evaluated');
      expect(await lessonCompleted(f)).toBe(0);
    });

    it('Submit -> Evaluate (PASS): no 409, evidence persisted, attempt evaluated, submission and snapshot untouched, no progression', async () => {
      const f = await fixture('teacher'); const a = await start(f); const v = await version(f, a.p, 'v1');
      const sub = await programming.submit(f.user, a.attempt.id, { programVersionId: v.id }) as Record<string, any>;
      expect((await attemptRow(a.attempt.id)).status).toBe('submitted');
      const submissionBefore = await md5('learning_submissions', 'id', sub.id);
      const attemptBefore = await attemptRow(a.attempt.id);

      const result = await evaluate(f, await runExperiment(f, a.attempt.id, v.id));
      expect(result).toMatchObject({ verdict: 'passed', versionNumber: 1, attemptId: a.attempt.id, progression: { completedLessonId: null, newlyUnlockedLessonIds: [] } });
      expect(await evalCount(f)).toBe(1);
      const attempt = await attemptRow(a.attempt.id);
      expect(attempt.status).toBe('evaluated');
      expect(attempt.result_snapshot).toMatchObject({ evaluationId: result.id, verdict: 'passed', evidence: { versionNumber: 1, programVersionId: v.id } });
      // the submitted source is immutable: same submission row, same frozen workspace/program snapshots on the attempt
      expect(await md5('learning_submissions', 'id', sub.id)).toEqual(submissionBefore);
      expect(attempt.program_snapshot).toEqual(attemptBefore.program_snapshot);
      expect(attempt.workspace_snapshot).toEqual(attemptBefore.workspace_snapshot);
      expect(await lessonCompleted(f)).toBe(0);
      const read = await evaluation.own(f.user, result.id) as Record<string, any>;
      expect(read).toMatchObject({ id: result.id, verdict: 'passed' });
    });

    it('Submit -> Evaluate (FAIL): evidence persisted, attempt evaluated, nothing completed', async () => {
      const f = await fixture('teacher'); const a = await start(f, armOnly, armWs); const v = await version(f, a.p, 'v1');
      await programming.submit(f.user, a.attempt.id, { programVersionId: v.id });
      const result = await evaluate(f, await runExperiment(f, a.attempt.id, v.id));
      expect(result.verdict).toBe('failed');
      expect((await attemptRow(a.attempt.id)).status).toBe('evaluated');
      expect(await evalCount(f)).toBe(1);
      expect(await lessonCompleted(f)).toBe(0);
    });

    it('duplicate evaluation converges on one evidence row and keeps the attempt evaluated; duplicate submission is rejected', async () => {
      const f = await fixture('teacher'); const a = await start(f); const v = await version(f, a.p, 'v1');
      await programming.submit(f.user, a.attempt.id, { programVersionId: v.id });
      const experimentId = await runExperiment(f, a.attempt.id, v.id);
      const first = await evaluate(f, experimentId); const again = await evaluate(f, experimentId);
      expect(again.id).toBe(first.id);
      expect(await evalCount(f)).toBe(1);
      expect((await attemptRow(a.attempt.id)).status).toBe('evaluated');
      const reused = await experiments.create(f.user, a.attempt.id, { programVersionId: v.id, executionMode: 'schematic' } as never) as { id: string };
      expect(reused.id).toBe(experimentId); // the same experiment is reused for the submitted version
      expect(await outcome(programming.submit(f.user, a.attempt.id, { programVersionId: v.id }))).toBe('ConflictException:ATTEMPT_NOT_IN_PROGRESS');
      expect(await outcome(programming.updateProgram(f.user, a.p.id, { title: 'late' }))).toBe('ConflictException:ATTEMPT_NOT_IN_PROGRESS');
    });

    it('only the submitted version can be run once the attempt is submitted; invalid submissions are rejected', async () => {
      const f = await fixture('teacher'); const a = await start(f); const v1 = await version(f, a.p, 'v1');
      const mate = await learning.startAttempt(f.classmate, f.delivery.id) as { id: string };
      const mateProgram = await programming.createProgram(f.classmate, mate.id, { title: 'M', workspaceJson: waitWs, robotProgram: waitProgram });
      const mateVersion = await programming.createVersion(f.classmate, mateProgram.id, { changeSummary: 'm' }) as Version;
      expect(await outcome(programming.submit(f.user, a.attempt.id, { programVersionId: mateVersion.id }))).toBe('BadRequestException'); // another learner's version
      expect(await outcome(programming.submit(f.user, a.attempt.id, { programVersionId: randomUUID() }))).toBe('BadRequestException'); // unknown version
      expect((await attemptRow(a.attempt.id)).status).toBe('in_progress'); // nothing was consumed by the rejected submissions
      await programming.submit(f.user, a.attempt.id, { programVersionId: v1.id });
      expect(await outcome(experiments.create(f.user, a.attempt.id, { programVersionId: mateVersion.id, executionMode: 'schematic' } as never))).toBe('NotFoundException');
    });

    it('authorization: another learner, a learner without the execute permission and another school cannot evaluate or read the evidence', async () => {
      const f = await fixture('teacher'); const a = await start(f); const v = await version(f, a.p, 'v1');
      await programming.submit(f.user, a.attempt.id, { programVersionId: v.id });
      const experimentId = await runExperiment(f, a.attempt.id, v.id);
      const result = await evaluate(f, experimentId);
      for (const [who, user] of [['classmate', f.classmate], ['no execute permission', f.noExecute], ['other school', f.outsider]] as const) {
        expect([who, await outcome(evaluation.evaluateOwnExperiment(user, experimentId))]).toEqual([who, 'NotFoundException']);
        expect([who, await outcome(evaluation.own(user, result.id))]).toEqual([who, 'NotFoundException']);
        expect([who, await outcome(programming.versions(user, a.p.id))]).toEqual([who, 'NotFoundException']);
        expect([who, await outcome(programming.submit(user, a.attempt.id, { programVersionId: v.id }))]).toEqual([who, 'NotFoundException']);
      }
      expect(await evalCount(f)).toBe(1);
    });

    it('does not mutate grades: an assessment written before the evaluation, and its release state, stay identical', async () => {
      const f = await fixture('teacher'); const a = await start(f); const v = await version(f, a.p, 'v1');
      const sub = await programming.submit(f.user, a.attempt.id, { programVersionId: v.id }) as Record<string, any>;
      await assessment.assess(f.teacher, sub.id, { overallFeedback: 'solid', scores: [{ criterionId: f.criterion.id, awardedPoints: 7 }] } as never);
      await assessment.releaseAttempt(f.teacher, a.attempt.id);
      const gradeBefore = await md5('learning_assessments', 'submission_id', sub.id);
      const releasedBefore = (await attemptRow(a.attempt.id)).grading_released_at;
      const gradingBefore = JSON.stringify(await assessment.myGrading(f.user, a.attempt.id));

      await evaluate(f, await runExperiment(f, a.attempt.id, v.id));
      expect(await md5('learning_assessments', 'submission_id', sub.id)).toEqual(gradeBefore);
      expect((await attemptRow(a.attempt.id)).grading_released_at).toEqual(releasedBefore);
      expect(JSON.stringify(await assessment.myGrading(f.user, a.attempt.id))).toBe(gradingBefore);
      const detail = await assessment.instructorSubmission(f.teacher, sub.id) as Record<string, any>;
      expect(detail.assessment.scores[0].awardedPoints).toBe(7);
    });
  });

  describe('L03 curriculum (symbolic_program) assignment keeps its progression contract', () => {
    it('Evaluate -> Submit completes the lesson once; Submit -> Evaluate also completes it; repeated evaluation is idempotent', async () => {
      const f1 = await fixture('curriculum'); const a1 = await start(f1); const v1 = await version(f1, a1.p, 'v1');
      await evaluate(f1, await runExperiment(f1, a1.attempt.id, v1.id));
      expect(await lessonCompleted(f1)).toBe(0);
      const sub = await programming.submit(f1.user, a1.attempt.id, { programVersionId: v1.id }) as Record<string, any>;
      expect(sub).toMatchObject({ evaluated: true, progression: { completedLessonId: f1.x.lesson.id } });
      expect(await lessonCompleted(f1)).toBe(1);

      const f2 = await fixture('curriculum'); const a2 = await start(f2); const v2 = await version(f2, a2.p, 'v1');
      await programming.submit(f2.user, a2.attempt.id, { programVersionId: v2.id });
      expect(await lessonCompleted(f2)).toBe(0);
      const experimentId = await runExperiment(f2, a2.attempt.id, v2.id);
      const result = await evaluate(f2, experimentId);
      expect(result).toMatchObject({ verdict: 'passed', progression: { completedLessonId: f2.x.lesson.id } });
      expect(await lessonCompleted(f2)).toBe(1);
      const again = await evaluate(f2, experimentId);
      expect(again.id).toBe(result.id);
      expect(await lessonCompleted(f2)).toBe(1);
      expect(await evalCount(f2)).toBe(1);
      expect((await attemptRow(a2.attempt.id)).status).toBe('evaluated');
    });

    it('a failed post-submission evaluation completes nothing', async () => {
      const f = await fixture('curriculum'); const a = await start(f, armOnly, armWs); const v = await version(f, a.p, 'v1');
      await programming.submit(f.user, a.attempt.id, { programVersionId: v.id });
      const result = await evaluate(f, await runExperiment(f, a.attempt.id, v.id));
      expect(result).toMatchObject({ verdict: 'failed', progression: { completedLessonId: null } });
      expect(await lessonCompleted(f)).toBe(0);
    });

    it('rolls the whole evaluation back (no evidence, attempt stays submitted) when progression itself conflicts (documented GAP-L03-05)', async () => {
      const f = await fixture('curriculum'); const a = await start(f); const v = await version(f, a.p, 'v1');
      await programming.submit(f.user, a.attempt.id, { programVersionId: v.id });
      const experimentId = await runExperiment(f, a.attempt.id, v.id);
      const other = await db.learning_lessons.create({ data: { course_id: f.x.course.id, title: 'L2', ordinal: 2 } });
      await db.learning_lesson_prerequisites.create({ data: { lesson_id: f.x.lesson.id, prerequisite_lesson_id: other.id, required: true } });
      expect(await outcome(evaluation.evaluateOwnExperiment(f.user, experimentId))).toMatch(/^ConflictException/);
      expect(await evalCount(f)).toBe(0);
      expect((await attemptRow(a.attempt.id)).status).toBe('submitted');
      expect(await lessonCompleted(f)).toBe(0);
    });
  });
});
