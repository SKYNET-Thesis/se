import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ActivityProgressService } from './activity-progress.service';
import { AssessmentService } from './assessment.service';
import { createDb, createSystemAdmin, createWorld, createStudent, describeDb, joinClassroom, type Db, type World } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { ProgrammingService } from './programming.service';
import { ProgressionService } from './progression.service';
import { SubmissionFilesService } from './submission-files.service';

/**
 * One submission per attempt (D03 Stage 2) against the disposable PostgreSQL database that has Stage 1 and Stage 2
 * applied. Real services, real SQL; only S3 is replaced by an in-memory fake (no AWS is ever contacted).
 */
const program = { schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'wait', durationMs: 100 }] };
const pdf = new Uint8Array([...Buffer.from('%PDF-1.7 d03 test file')]);

describeDb('real PostgreSQL attempt-based submissions', () => {
  jest.setTimeout(30_000); // each scenario performs dozens of sequential real-database calls
  // Only connect when the isolated database is configured (the suite is skipped, and must not fail to load, otherwise).
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let scope: LearningScopeService; let enrollments: EnrollmentDeliveryService; let progression: ProgressionService;
  let activityProgress: ActivityProgressService;
  let learning: LearningService; let programming: ProgrammingService; let assessment: AssessmentService; let files: SubmissionFilesService;
  const storage = {
    createUpload: jest.fn().mockResolvedValue({ url: 'https://s3.invalid', fields: {} }),
    head: jest.fn(), readRange: jest.fn(), createDownload: jest.fn().mockResolvedValue('https://signed.invalid/x'),
  };

  beforeAll(async () => {
    await db.$connect();
    scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    progression = new ProgressionService(db as never, scope);
    learning = new LearningService(db as never, scope, progression, enrollments);
    activityProgress = new ActivityProgressService(db as never, progression);
    programming = new ProgrammingService(db as never, scope);
    assessment = new AssessmentService(db as never, scope);
    files = new SubmissionFilesService(db as never, scope, storage as never);
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture(options: { maxAttempts?: number | null } = {}) {
    const x: World = await createWorld(db);
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, title: 'Program task', instructions: 'Do it', constraints: { attachments: { enabled: true } } } });
    const criterion = await db.learning_rubric_criteria.create({ data: { assignment_id: assignment.id, title: 'Safety', max_points: 10, ordinal: 1 } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status: 'published', max_attempts: options.maxAttempts === undefined ? null : options.maxAttempts } });
    const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id); await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: s.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: s.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    const teacher = await createSystemAdmin(db);
    return { x, assignment, criterion, delivery, s, user, teacher };
  }
  type Fx = Awaited<ReturnType<typeof fixture>>;

  /** Start (or resume) an attempt, save a program, checkpoint a version and submit it: the existing Blockly API sequence. */
  async function submitAttempt(f: Fx, user = f.user, workspace: Record<string, unknown> = { blocks: [{ type: 'robot_wait' }] }) {
    const attempt = await learning.startAttempt(user, f.delivery.id) as { id: string; attempt_number: number };
    const created = await programming.createProgram(user, attempt.id, { title: `P${attempt.attempt_number}`, workspaceJson: workspace, robotProgram: program });
    const version = await programming.createVersion(user, created.id, { changeSummary: `v for attempt ${attempt.attempt_number}` });
    const submission = await programming.submit(user, attempt.id, { programVersionId: version.id, reflection: `reflection ${attempt.attempt_number}` });
    return { attempt, program: created, version, submission };
  }
  const row = async (sql: Promise<unknown[]>) => (await sql)[0] as Record<string, unknown>;
  const fingerprint = (id: string) => row(db.$queryRaw`SELECT md5(s::text) AS h FROM public.learning_submissions s WHERE id=${id}::uuid`);

  it('keeps the first attempt\'s submission, program version and snapshot unchanged after a second attempt', async () => {
    const f = await fixture();
    const first = await submitAttempt(f);
    const before = await fingerprint((first.submission as { id: string }).id);
    const attemptBefore = await row(db.$queryRaw`SELECT md5(a::text) AS h FROM public.learning_assignment_attempts a WHERE id=${first.attempt.id}::uuid`);
    const second = await submitAttempt(f, f.user, { blocks: [{ type: 'robot_wait', second: true }] });
    expect(second.attempt.id).not.toBe(first.attempt.id);
    expect((second.submission as { id: string }).id).not.toBe((first.submission as { id: string }).id);
    expect(await fingerprint((first.submission as { id: string }).id)).toEqual(before);
    expect(await row(db.$queryRaw`SELECT md5(a::text) AS h FROM public.learning_assignment_attempts a WHERE id=${first.attempt.id}::uuid`)).toEqual(attemptBefore);
    const subs = await db.learning_submissions.findMany({ where: { assignment_id: f.assignment.id, learner_user_id: f.s.user.id }, orderBy: { created_at: 'asc' } });
    expect(subs.map((s) => s.attempt_id)).toEqual([first.attempt.id, second.attempt.id]);
    expect(subs.map((s) => s.program_version_id)).toEqual([first.version.id, second.version.id]);
    expect(subs.map((s) => s.reflection)).toEqual(['reflection 1', 'reflection 2']);
  });

  it('rejects a repeated final submission, edits after submission and a second DB row for the same attempt', async () => {
    const f = await fixture();
    const first = await submitAttempt(f);
    await expect(programming.submit(f.user, first.attempt.id, { programVersionId: first.version.id })).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_IN_PROGRESS' } });
    await expect(programming.updateProgram(f.user, first.program.id, { title: 'late edit' })).rejects.toBeInstanceOf(ConflictException);
    await expect(programming.createVersion(f.user, first.program.id, { changeSummary: 'late' })).rejects.toBeInstanceOf(ConflictException);
    await expect(db.learning_submissions.create({ data: { assignment_id: f.assignment.id, learner_user_id: f.s.user.id, program_id: first.program.id, program_version_id: first.version.id, status: 'submitted', attempt_id: first.attempt.id } })).rejects.toBeDefined();
    // the database also freezes the finalized submission itself
    await expect(db.$executeRaw`UPDATE public.learning_submissions SET reflection='tampered' WHERE attempt_id=${first.attempt.id}::uuid`).rejects.toBeDefined();
  });

  it('grades and gives feedback to each attempt independently, and the correct attempt is reviewed', async () => {
    const f = await fixture();
    const a1 = await submitAttempt(f); const a2 = await submitAttempt(f);
    const s1 = (a1.submission as { id: string }).id; const s2 = (a2.submission as { id: string }).id;
    await assessment.assess(f.teacher, s1, { overallFeedback: 'first try', scores: [{ criterionId: f.criterion.id, awardedPoints: 4 }] } as never);
    await assessment.assess(f.teacher, s2, { overallFeedback: 'second try', scores: [{ criterionId: f.criterion.id, awardedPoints: 9 }] } as never);
    await assessment.feedback(f.teacher, s1, { content: 'try more safety' } as never);
    await assessment.feedback(f.teacher, s2, { content: 'much better' } as never);
    const d1 = await assessment.instructorSubmission(f.teacher, s1) as Record<string, any>;
    const d2 = await assessment.instructorSubmission(f.teacher, s2) as Record<string, any>;
    expect(d1.attempt.attemptNumber).toBe(1); expect(d2.attempt.attemptNumber).toBe(2);
    expect(d1.assessment.overallFeedback).toBe('first try'); expect(d2.assessment.overallFeedback).toBe('second try');
    expect(d1.assessment.scores[0].awardedPoints).toBe(4); expect(d2.assessment.scores[0].awardedPoints).toBe(9);
    expect(d1.feedback.map((x: any) => x.content)).toEqual(['try more safety']);
    expect(d2.feedback.map((x: any) => x.content)).toEqual(['much better']);
    expect(d1.program_version.id).toBe(a1.version.id); expect(d2.program_version.id).toBe(a2.version.id);
    const listed = await assessment.classroomSubmissions(f.teacher, f.x.room.id) as Array<Record<string, any>>;
    expect(listed.filter((r) => r.learner_user_id === f.s.user.id).map((r) => r.attempt_number).sort()).toEqual([1, 2]);
  });

  it('shows students nothing of their grading until the attempt is released, and only that attempt afterwards', async () => {
    const f = await fixture();
    const a1 = await submitAttempt(f); const a2 = await submitAttempt(f);
    const s1 = (a1.submission as { id: string }).id; const s2 = (a2.submission as { id: string }).id;
    await assessment.assess(f.teacher, s1, { overallFeedback: 'private one', scores: [{ criterionId: f.criterion.id, awardedPoints: 5 }] } as never);
    await assessment.feedback(f.teacher, s1, { content: 'private comment one' } as never);
    await assessment.assess(f.teacher, s2, { overallFeedback: 'private two', scores: [{ criterionId: f.criterion.id, awardedPoints: 8 }] } as never);

    expect(await assessment.myGrading(f.user, a1.attempt.id)).toEqual({ attemptId: a1.attempt.id, released: false });
    expect(await assessment.myFeedback(f.user, s1)).toEqual([]);
    const listing = JSON.stringify(await learning.myLearning(f.user));
    expect(listing).not.toMatch(/private one|private two|private comment/);

    await assessment.releaseAttempt(f.teacher, a1.attempt.id);
    const g1 = await assessment.myGrading(f.user, a1.attempt.id) as Record<string, any>;
    expect(g1.released).toBe(true); expect(g1.assessment.overallFeedback).toBe('private one');
    expect(g1.feedback.map((x: any) => x.content)).toEqual(['private comment one']);
    expect(g1.assessment.scores[0]).toMatchObject({ title: 'Safety', awardedPoints: 5 });
    // attempt 2 stays hidden, through every student-facing route
    expect(await assessment.myGrading(f.user, a2.attempt.id)).toEqual({ attemptId: a2.attempt.id, released: false });
    expect(await assessment.myFeedback(f.user, s2)).toEqual([]);
    expect((await assessment.myFeedback(f.user, s1) as unknown[]).length).toBe(1);

    const history = await learning.attemptHistory(f.user, f.delivery.id) as Array<Record<string, any>>;
    expect(history.map((h) => [h.attempt_number, h.grading_released, h.submission_id])).toEqual([[2, false, s2], [1, true, s1]]);
    // releasing is idempotent and refuses an ungraded attempt
    await expect(assessment.releaseAttempt(f.teacher, a1.attempt.id)).resolves.toMatchObject({ released: true });
    const a3 = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    await expect(assessment.releaseAttempt(f.teacher, a3.id)).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_SUBMITTED' } });
  });

  it('never lets another student read, list or download a student\'s attempt, grading or files', async () => {
    const f = await fixture();
    const other = await createStudent(db, f.x); await joinClassroom(db, other, f.x.room.id); await enrollments.synchronizeClassroom(f.x.room.id);
    const otherUser = { authUserId: 'b', vistaUserId: other.user.id, email: 'o@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: other.membership.id, organizationId: f.x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    const a1 = await submitAttempt(f);
    const sid = (a1.submission as { id: string }).id;
    await assessment.assess(f.teacher, sid, { overallFeedback: 'x', scores: [{ criterionId: f.criterion.id, awardedPoints: 1 }] } as never);
    await assessment.releaseAttempt(f.teacher, a1.attempt.id);
    await expect(assessment.myGrading(otherUser, a1.attempt.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(assessment.myFeedback(otherUser, sid)).rejects.toBeInstanceOf(NotFoundException);
    await expect(files.list(otherUser, a1.attempt.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(files.createUpload(otherUser, a1.attempt.id, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(programming.submit(otherUser, a1.attempt.id, { programVersionId: a1.version.id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(programming.updateProgram(otherUser, a1.program.id, { title: 'steal' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks every student write after enrollment revocation but keeps the preserved history readable', async () => {
    const f = await fixture();
    const first = await submitAttempt(f);
    const open = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    const created = await programming.createProgram(f.user, open.id, { title: 'open', workspaceJson: {}, robotProgram: program });
    await enrollments.revokeClassroomEnrollment(f.x.room.id, f.s.user.id);
    await expect(programming.updateProgram(f.user, created.id, { title: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(programming.createVersion(f.user, created.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(files.createUpload(f.user, open.id, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(progression.saveQuizDraft(f.user, open.id, { answers: [] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(learning.startAttempt(f.user, f.delivery.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(learning.attemptHistory(f.user, f.delivery.id)).resolves.toHaveLength(2);
    await expect(assessment.myGrading(f.user, first.attempt.id)).resolves.toEqual({ attemptId: first.attempt.id, released: false });
    await expect(files.list(f.user, first.attempt.id)).resolves.toEqual([]);
  });

  it('enforces the delivery window on submission and uploads (closed deliveries accept nothing)', async () => {
    const f = await fixture();
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    const created = await programming.createProgram(f.user, attempt.id, { title: 'w', workspaceJson: {}, robotProgram: program });
    const version = await programming.createVersion(f.user, created.id, {});
    await db.learning_classroom_assignments.update({ where: { id: f.delivery.id }, data: { close_at: new Date(Date.now() - 1000), due_at: new Date(Date.now() - 5000) } });
    await expect(programming.submit(f.user, attempt.id, { programVersionId: version.id })).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_CLOSED' } });
    await expect(files.createUpload(f.user, attempt.id, { filename: 'a.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_CLOSED' } });
    await expect(programming.updateProgram(f.user, created.id, { title: 'late' })).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_CLOSED' } });
    await db.learning_classroom_assignments.update({ where: { id: f.delivery.id }, data: { close_at: null, status: 'closed' } });
    await expect(programming.submit(f.user, attempt.id, { programVersionId: version.id })).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_NOT_AVAILABLE' } });
  });

  it('attaches approved files per attempt, freezes them at submission and keeps them out of other attempts', async () => {
    const f = await fixture();
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    const created = await programming.createProgram(f.user, attempt.id, { title: 'f', workspaceJson: {}, robotProgram: program });
    const version = await programming.createVersion(f.user, created.id, {});
    const { file } = await files.createUpload(f.user, attempt.id, { filename: 'report.pdf', contentType: 'application/pdf', sizeBytes: pdf.length }) as unknown as { file: { id: string } };
    const stored = await db.learning_submission_files.findUniqueOrThrow({ where: { id: file.id } });
    expect(stored.object_key).toBe(`learning-media/submissions/${f.assignment.id}/${f.s.user.id}/${attempt.id}/${file.id}.pdf`);
    // submission is refused while the upload is still being verified, then allowed once it is complete
    await expect(programming.submit(f.user, attempt.id, { programVersionId: version.id })).rejects.toMatchObject({ response: { code: 'ATTACHMENT_PENDING' } });
    storage.head.mockResolvedValue({ contentLength: pdf.length, contentType: 'application/pdf', fileId: file.id });
    storage.readRange.mockImplementation(async (_k: string, s: number, e: number) => pdf.slice(s, e + 1));
    await expect(files.completeUpload(f.user, attempt.id, file.id)).resolves.toMatchObject({ status: 'ready' });
    await programming.submit(f.user, attempt.id, { programVersionId: version.id });
    // frozen: no new files, no removal, no late completion; the database trigger agrees
    await expect(files.createUpload(f.user, attempt.id, { filename: 'b.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toBeInstanceOf(ConflictException);
    await expect(files.remove(f.user, attempt.id, file.id)).rejects.toBeInstanceOf(ConflictException);
    await expect(db.$executeRaw`UPDATE public.learning_submission_files SET status='removed' WHERE id=${file.id}::uuid`).rejects.toBeDefined();
    // history: the file stays on ITS attempt only and remains downloadable by its owner
    const second = await submitAttempt(f);
    expect(await files.list(f.user, second.attempt.id)).toEqual([]);
    expect(await files.list(f.user, attempt.id)).toHaveLength(1);
    await expect(files.downloadUrl(f.user, attempt.id, file.id)).resolves.toMatchObject({ filename: 'report.pdf' });
    const history = await learning.attemptHistory(f.user, f.delivery.id) as Array<Record<string, any>>;
    expect(history.find((h) => h.id === attempt.id)!.file_count).toBe(1);
    expect(history.find((h) => h.id === second.attempt.id)!.file_count).toBe(0);
  });

  it('keeps the attachment limit at 5 files per attempt', async () => {
    const f = await fixture();
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    for (let i = 0; i < 5; i += 1) await files.createUpload(f.user, attempt.id, { filename: `f${i}.pdf`, contentType: 'application/pdf', sizeBytes: 5 });
    await expect(files.createUpload(f.user, attempt.id, { filename: 'six.pdf', contentType: 'application/pdf', sizeBytes: 5 })).rejects.toMatchObject({ response: { code: 'ATTACHMENT_LIMIT' } });
    expect(randomUUID()).toBeDefined();
  });

  it('does not regress previously completed program evidence when the learner retries (attempt 2 leaves attempt 1\'s pass intact)', async () => {
    const f = await fixture();
    const section = await db.learning_sections.findFirstOrThrow({ where: { lesson_id: f.x.lesson.id } });
    const activity = await db.learning_activities.create({ data: { section_id: section.id, title: 'Program it', type: 'guided_practice', ordinal: 2, status: 'published', content_ref: { kind: 'assignment', id: f.assignment.id } } });
    const completed = async () => {
      const progress = await activityProgress.courseProgress(f.user, f.x.course.id);
      return progress.activities.find((a) => a.activityId === activity.id)!.status;
    };
    expect(await completed()).toBe('not_started');
    const first = await submitAttempt(f);
    const sid = (first.submission as { id: string }).id;
    // a passing, persisted schematic evaluation for attempt 1 (what the evaluation flow stores)
    const experiment = await db.learning_experiments.create({ data: { submission_id: sid, learner_user_id: f.s.user.id, method: 'blockly', execution_mode: 'schematic', status: 'succeeded',
      input_snapshot: { attemptId: first.attempt.id, programVersionId: first.version.id } } });
    await db.$executeRaw`
      INSERT INTO public.learning_symbolic_evaluations(experiment_id,submission_id,program_version_id,requested_by_user_id,evaluator_version,schematic_schema_version,schematic_engine_version,
        program_hash,output_snapshot_hash,rule_set_schema_version,rule_set_hash,rule_set_snapshot,fingerprint,verdict,rule_results,metrics)
      VALUES(${experiment.id}::uuid,${sid}::uuid,${first.version.id}::uuid,${f.s.user.id}::uuid,'t',1,'t','h','h',1,'h','{}'::jsonb,${randomUUID()},'passed','[]'::jsonb,'{}'::jsonb)`;
    await db.$executeRaw`UPDATE public.learning_assignment_attempts SET status='evaluated' WHERE id=${first.attempt.id}::uuid`;
    expect(await completed()).toBe('completed');
    // The retry: attempt 2 with a different program version and its own submission. Under the legacy UPSERT this overwrote the
    // submission row and broke the evidence join (program_version mismatch); now attempt 1's evidence is untouched.
    const second = await submitAttempt(f, f.user, { blocks: [{ type: 'robot_wait', retry: true }] });
    expect(second.version.id).not.toBe(first.version.id);
    expect(await completed()).toBe('completed');
    const kept = await db.learning_submissions.findUniqueOrThrow({ where: { id: sid } });
    expect(kept.program_version_id).toBe(first.version.id);
  });
});
