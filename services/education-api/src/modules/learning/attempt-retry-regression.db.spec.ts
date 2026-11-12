import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ActivityProgressService } from './activity-progress.service';
import { AssessmentService } from './assessment.service';
import { createDb, createSystemAdmin, createWorld, createStudent, describeDb, joinClassroom, type Db, type World } from './db-test-support';
import { DemonstrationLessonService } from './demonstration-lesson.service';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { ExperimentService } from './experiment.service';
import { LearningInsightsService } from './learning-insights.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { PhysicalExecutionService } from './physical-execution.service';
import { ProgrammingService } from './programming.service';
import { ProgressionService } from './progression.service';
import { SchematicEngineService } from './schematic-engine.service';
import { SchemaCompatibilityService } from './schema-compatibility.service';
import { SymbolicEvaluationPreparationService } from './symbolic-rules/symbolic-evaluation-preparation.service';

/**
 * Run vs final submit, and multi-attempt regression, on the disposable PostgreSQL database with Stage 1 + Stage 2 applied.
 * Real services and SQL for everything that reads or writes submissions; the schematic engine's output and the symbolic verdict
 * are persisted rows (what the evaluation flow stores), not recomputed.
 */
const program = { schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'wait', durationMs: 100 }] };

describeDb('attempt runs, final submission and retries (real PostgreSQL)', () => {
  jest.setTimeout(60_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let scope: LearningScopeService; let enrollments: EnrollmentDeliveryService; let progression: ProgressionService; let learning: LearningService;
  let programming: ProgrammingService; let experiments: ExperimentService; let assessment: AssessmentService; let activity: ActivityProgressService;
  const evaluator = { assertSupportedOutput: jest.fn() };
  const compiler = { compile: jest.fn().mockReturnValue({ schemaVersion: 1, ruleSetHash: 'hash', kind: 'rules', rules: [], sources: [] }) };
  const runtime = { status: jest.fn().mockResolvedValue(null) };

  beforeAll(async () => {
    await db.$connect();
    scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    progression = new ProgressionService(db as never, scope);
    learning = new LearningService(db as never, scope, progression, enrollments);
    programming = new ProgrammingService(db as never, scope, progression);
    experiments = new ExperimentService(db as never, scope, new SchematicEngineService());
    assessment = new AssessmentService(db as never, scope);
    activity = new ActivityProgressService(db as never, progression);
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture() {
    const x: World = await createWorld(db);
    const challenge = await db.learning_challenges.create({ data: { title: 'Reach target' } });
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, challenge_id: challenge.id, title: 'Program task', instructions: 'Do it', allowed_blocks: ['wait'], constraints: { kind: 'symbolic_program' } } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status: 'published' } });
    // The physical-execution scope needs the platform 'student' role with the execute permission.
    const studentRole = await db.roles.upsert({ where: { code: 'student' }, update: {}, create: { code: 'student', name: 'Student', scope: 'organization' } });
    const permission = await db.permissions.upsert({ where: { code: 'learning.experiment.execute' }, update: {}, create: { code: 'learning.experiment.execute' } });
    await db.$executeRaw`INSERT INTO public.role_permissions(role_id,permission_id) VALUES(${studentRole.id}::uuid,${permission.id}::uuid) ON CONFLICT DO NOTHING`;
    const s = await createStudent(db, { org: x.org, role: studentRole });
    await joinClassroom(db, s, x.room.id); await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: s.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: s.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write', 'learning.experiment.execute'] }] } as never;
    return { x, challenge, assignment, delivery, s, user, teacher: await createSystemAdmin(db) };
  }
  type Fx = Awaited<ReturnType<typeof fixture>>;

  async function openAttempt(f: Fx, workspace: Record<string, unknown> = { blocks: [{ type: 'robot_wait' }] }) {
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string; attempt_number: number };
    const created = await programming.createProgram(f.user, attempt.id, { title: `P${attempt.attempt_number}`, workspaceJson: workspace, robotProgram: program });
    const version = await programming.createVersion(f.user, created.id, { changeSummary: `v${attempt.attempt_number}` });
    return { attempt, program: created, version };
  }
  /** A simulation RUN: create the experiment through the real service, then persist a succeeded schematic result and a symbolic verdict. */
  async function run(f: Fx, a: { attempt: { id: string }; version: { id: string } }, verdict: 'passed' | 'failed' = 'passed') {
    const exp = await experiments.create(f.user, a.attempt.id, { programVersionId: a.version.id, executionMode: 'schematic' } as never) as { id: string };
    const row = await db.learning_experiments.findUniqueOrThrow({ where: { id: exp.id } });
    await db.learning_experiments.update({ where: { id: exp.id }, data: { status: 'succeeded', output_snapshot: { schemaVersion: 1, engineVersion: 't', robotProgramVersionId: a.version.id } } });
    const evaluationId = randomUUID();
    await db.$executeRaw`
      INSERT INTO public.learning_symbolic_evaluations(id,experiment_id,submission_id,program_version_id,requested_by_user_id,evaluator_version,schematic_schema_version,schematic_engine_version,
        program_hash,output_snapshot_hash,rule_set_schema_version,rule_set_hash,rule_set_snapshot,fingerprint,verdict,rule_results,metrics)
      VALUES(${evaluationId}::uuid,${exp.id}::uuid,${row.submission_id}::uuid,${a.version.id}::uuid,${f.s.user.id}::uuid,'t',1,'t','h','h',1,'h','{}'::jsonb,${randomUUID()},${verdict},'[]'::jsonb,'{}'::jsonb)`;
    // what SymbolicEvaluationService records for a run on an open attempt (the attempt stays in progress)
    await db.$executeRaw`UPDATE public.learning_assignment_attempts SET result_snapshot=${JSON.stringify({ evaluationId, programVersionId: a.version.id, verdict })}::jsonb WHERE id=${a.attempt.id}::uuid AND status='in_progress'`;
    return { experimentId: exp.id, evaluationId, submissionId: row.submission_id as string };
  }
  const submissionsOf = (f: Fx) => db.learning_submissions.findMany({ where: { learner_user_id: f.s.user.id }, orderBy: { created_at: 'asc' } });
  const attemptStatus = async (id: string) => (await db.learning_assignment_attempts.findUniqueOrThrow({ where: { id } })).status;

  it('a simulation run never finalizes, locks or consumes the attempt, and is invisible as a submission', async () => {
    const f = await fixture();
    const a = await openAttempt(f);
    const first = await run(f, a);
    const [draft] = await submissionsOf(f);
    expect(draft).toMatchObject({ id: first.submissionId, status: 'draft', attempt_id: a.attempt.id, program_version_id: a.version.id });
    expect(await attemptStatus(a.attempt.id)).toBe('in_progress');
    // still editable: save program, new version, run again (the same draft is reused for the new version)
    await programming.updateProgram(f.user, a.program.id, { title: 'edited' });
    const v2 = await programming.createVersion(f.user, a.program.id, { changeSummary: 'v2' });
    const second = await run(f, { attempt: a.attempt, version: v2 });
    expect(second.submissionId).toBe(first.submissionId);
    expect((await submissionsOf(f))).toHaveLength(1);
    expect((await db.learning_submissions.findUniqueOrThrow({ where: { id: first.submissionId } })).program_version_id).toBe(v2.id);
    // nothing that lists or reviews FINAL submissions shows the draft; the attempt is not counted as submitted
    expect(await assessment.classroomSubmissions(f.teacher, f.x.room.id)).toEqual([]);
    expect(await assessment.mySubmissions(f.user)).toEqual([]);
    const history = await learning.attemptHistory(f.user, f.delivery.id) as Array<Record<string, any>>;
    expect(history[0]).toMatchObject({ status: 'in_progress', submission_id: null });
    await expect(assessment.assess(f.teacher, first.submissionId, { scores: [] } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(JSON.stringify(await learning.myLearning(f.user))).not.toContain('"status":"submitted"');
    // a run did not complete the lesson even though the verdict passed
    expect((await db.learning_lesson_progress.findMany({ where: { learner_user_id: f.s.user.id, status: 'completed' } }))).toHaveLength(0);
  });

  it('Submit assignment is the one explicit final action: it promotes the draft, locks the attempt and finalizes an evaluated version', async () => {
    const f = await fixture();
    const a = await openAttempt(f);
    const r = await run(f, a, 'passed');
    const submitted = await programming.submit(f.user, a.attempt.id, { programVersionId: a.version.id, reflection: 'done' }) as Record<string, any>;
    expect(submitted.id).toBe(r.submissionId); // the draft row became the final submission, no duplicate
    expect(submitted).toMatchObject({ status: 'submitted', evaluated: true });
    expect(await submissionsOf(f)).toHaveLength(1);
    expect(await attemptStatus(a.attempt.id)).toBe('evaluated');
    expect(submitted.progression.completedLessonId).toBe(f.x.lesson.id); // the PASS the run recorded is projected at submit time
    await expect(programming.submit(f.user, a.attempt.id, { programVersionId: a.version.id })).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_IN_PROGRESS' } });
    await expect(programming.createVersion(f.user, a.program.id, {})).rejects.toBeInstanceOf(ConflictException);
    await expect(programming.updateProgram(f.user, a.program.id, { title: 'late' })).rejects.toBeInstanceOf(ConflictException);
    // after submission only the submitted version can still be run
    await expect(experiments.create(f.user, a.attempt.id, { programVersionId: randomUUID(), executionMode: 'schematic' } as never)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a submit without a matching evaluation finalizes as submitted, and a failed run never completes the lesson', async () => {
    const f = await fixture();
    const a = await openAttempt(f);
    await run(f, a, 'failed');
    const submitted = await programming.submit(f.user, a.attempt.id, { programVersionId: a.version.id }) as Record<string, any>;
    expect(submitted.evaluated).toBe(true);
    expect(submitted.progression.completedLessonId).toBeNull();
    const b = await openAttempt(f);
    const plain = await programming.submit(f.user, b.attempt.id, { programVersionId: b.version.id }) as Record<string, any>;
    expect(plain).toMatchObject({ status: 'submitted', evaluated: false });
    expect(await attemptStatus(b.attempt.id)).toBe('submitted');
  });

  it('attempt 2 (runs, edits, retry) leaves attempt 1\'s evidence and completed lesson untouched', async () => {
    const f = await fixture();
    const a1 = await openAttempt(f);
    const r1 = await run(f, a1, 'passed');
    await programming.submit(f.user, a1.attempt.id, { programVersionId: a1.version.id });
    const course = f.x.course.id;
    const completedBefore = async () => (await activity.courseProgress(f.user, course)).activities.map((x) => x.status);
    const progressRows = () => db.learning_lesson_progress.findMany({ where: { learner_user_id: f.s.user.id }, orderBy: { lesson_id: 'asc' } });
    const before = JSON.stringify(await progressRows());
    const statusesBefore = await completedBefore();
    const a1Row = await db.learning_submissions.findUniqueOrThrow({ where: { id: r1.submissionId } });
    const a1Hash = JSON.stringify(a1Row);

    const a2 = await openAttempt(f, { blocks: [{ type: 'robot_wait', retry: true }] });
    await run(f, a2, 'failed');
    const v2b = await programming.createVersion(f.user, a2.program.id, { changeSummary: 'second try' });
    await run(f, { attempt: a2.attempt, version: v2b }, 'failed');
    await programming.submit(f.user, a2.attempt.id, { programVersionId: v2b.id });

    expect(JSON.stringify(await db.learning_submissions.findUniqueOrThrow({ where: { id: r1.submissionId } }))).toBe(a1Hash);
    expect(JSON.stringify(await progressRows())).toBe(before); // the completed lesson did not regress
    expect(await completedBefore()).toEqual(statusesBefore);
    expect((await db.learning_symbolic_evaluations.findUniqueOrThrow({ where: { id: r1.evaluationId } })).verdict).toBe('passed');
    expect(await attemptStatus(a1.attempt.id)).toBe('evaluated');
    expect((await db.learning_submissions.findMany({ where: { learner_user_id: f.s.user.id, status: 'submitted' } }))).toHaveLength(2);
  });

  it('symbolic-evaluation-preparation resolves each experiment to ITS OWN attempt, submission and version after a retry', async () => {
    const f = await fixture();
    const a1 = await openAttempt(f); const r1 = await run(f, a1, 'passed');
    await programming.submit(f.user, a1.attempt.id, { programVersionId: a1.version.id });
    const a2 = await openAttempt(f, { blocks: [{ type: 'robot_wait', retry: true }] }); const r2 = await run(f, a2, 'passed');
    const prep = new SymbolicEvaluationPreparationService(db as never, scope, compiler as never, evaluator as never);
    const p1 = await prep.prepareForOwnExperiment(f.user, r1.experimentId);
    expect(p1).toMatchObject({ attemptId: a1.attempt.id, submissionId: r1.submissionId, programVersionId: a1.version.id, submissionStatus: 'submitted' });
    // attempt 2 is still a run: its experiment is bound to the DRAFT, which the finalizer must not treat as submitted
    const p2 = await prep.prepareForOwnExperiment(f.user, r2.experimentId);
    expect(p2).toMatchObject({ attemptId: a2.attempt.id, submissionId: r2.submissionId, programVersionId: a2.version.id, submissionStatus: 'draft' });
    expect(p1.submissionId).not.toBe(p2.submissionId);
  });

  it('demonstration-lesson resolves the submission of the requested attempt, never the latest one, and ignores drafts', async () => {
    const f = await fixture();
    const a1 = await openAttempt(f); const s1 = (await programming.submit(f.user, a1.attempt.id, { programVersionId: a1.version.id }) as { id: string }).id;
    const a2 = await openAttempt(f, { blocks: [{ type: 'robot_wait', retry: true }] });
    const draft = (await run(f, a2, 'failed')).submissionId;
    const service = new DemonstrationLessonService({ get: jest.fn() } as never, learning, db as never) as unknown as { context: (u: unknown, attemptId: string) => Promise<{ submission_id: string }> };
    expect((await service.context(f.user, a1.attempt.id)).submission_id).toBe(s1);
    await expect(service.context(f.user, a2.attempt.id)).rejects.toBeInstanceOf(NotFoundException); // only a draft: not a submitted program
    const s2 = (await programming.submit(f.user, a2.attempt.id, { programVersionId: a2.version.id }) as { id: string }).id;
    expect(s2).toBe(draft);
    expect((await service.context(f.user, a2.attempt.id)).submission_id).toBe(s2);
    expect((await service.context(f.user, a1.attempt.id)).submission_id).toBe(s1);
  });

  it('physical-execution eligibility follows each attempt\'s own passed evidence; a retry neither inherits nor removes it', async () => {
    const f = await fixture();
    const a1 = await openAttempt(f); await run(f, a1, 'passed');
    await programming.submit(f.user, a1.attempt.id, { programVersionId: a1.version.id });
    const physical = new PhysicalExecutionService(db as never, runtime as never);
    const e1 = await physical.eligibility(f.user, a1.attempt.id) as Record<string, any>;
    expect(e1.eligible).toBe(false);
    expect(e1.code).toBe('ROBOT_NOT_ALLOCATED'); // past the submission and symbolic-PASS checks: only the robot is missing in this fixture
    const a2 = await openAttempt(f, { blocks: [{ type: 'robot_wait', retry: true }] });
    await run(f, a2, 'passed'); // a passing RUN is not a submission
    const e2draft = await physical.eligibility(f.user, a2.attempt.id) as Record<string, any>;
    expect(e2draft.code).toBe('PHYSICAL_EXECUTION_NOT_ELIGIBLE');
    await programming.submit(f.user, a2.attempt.id, { programVersionId: a2.version.id });
    expect(((await physical.eligibility(f.user, a2.attempt.id)) as Record<string, any>).code).toBe('ROBOT_NOT_ALLOCATED');
    expect(((await physical.eligibility(f.user, a1.attempt.id)) as Record<string, any>).code).toBe('ROBOT_NOT_ALLOCATED'); // attempt 1 unchanged
  });

  it('the schema capability probe sees both D03 stages on this database', async () => {
    await expect(new SchemaCompatibilityService(db as never).read()).resolves.toEqual({ stage1: true, stage2: true });
  });

  it('student insights count only final submissions: a run changes nothing, the final submit does', async () => {
    const f = await fixture();
    const insights = new LearningInsightsService(db as never, scope);
    const counts = async () => { const d = await insights.myDashboard(f.user) as Record<string, number>; const l = await insights.myLearningSummary(f.user) as Record<string, number>; return { submissions: d.submission_count, submitted: l.submitted_attempts }; };
    const a = await openAttempt(f);
    await run(f, a, 'passed'); await run(f, a, 'failed'); // two runs: two experiments, still no submission
    expect(await counts()).toEqual({ submissions: 0, submitted: 0 });
    await programming.submit(f.user, a.attempt.id, { programVersionId: a.version.id });
    expect((await counts()).submissions).toBe(1);
  });
});
