import { LearningInsightsService } from './learning-insights.service';
import { AssessmentService } from './assessment.service';
import { AssignmentConfigService } from './assignment-config.service';
import { createDb, createStudent, createSystemAdmin, createWorld, describeDb, joinClassroom, schoolAdminUser, type Db, type World } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { ProgrammingService } from './programming.service';
import { ProgressionService } from './progression.service';

const program = { schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'wait', durationMs: 100 }] };

describeDb('real PostgreSQL assignment configuration, rubric grading, release and audited correction', () => {
  jest.setTimeout(30_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let insights: LearningInsightsService; let learning: LearningService; let programming: ProgrammingService; let assessment: AssessmentService; let config: AssignmentConfigService; let enrollments: EnrollmentDeliveryService;
  beforeAll(async () => {
    await db.$connect();
    const scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    learning = new LearningService(db as never, scope, new ProgressionService(db as never, scope), enrollments);
    programming = new ProgrammingService(db as never, scope);
    assessment = new AssessmentService(db as never, scope);
    insights = new LearningInsightsService(db as never, scope);
    config = new AssignmentConfigService(db as never, scope);
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture(status = 'published') {
    const x: World = await createWorld(db);
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, title: 'Gripper', instructions: 'Do it' } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status } });
    const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id); await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: s.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: s.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    const teacher = await createSystemAdmin(db);
    const outsider = schoolAdminUser((await createWorld(db)).org.id);
    return { x, assignment, delivery, s, user, teacher, outsider };
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  const rubric = { criteria: [{ title: 'Sequence', maxPoints: 6 }, { title: 'Safety', description: 'Stops safely', maxPoints: 4 }] };
  async function submit(f: F) {
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    const created = await programming.createProgram(f.user, attempt.id, { title: 'P', workspaceJson: { blocks: [] }, robotProgram: program });
    const version = await programming.createVersion(f.user, created.id, { changeSummary: 'v' });
    const submission = await programming.submit(f.user, attempt.id, { programVersionId: version.id }) as { id: string };
    return { attempt, submission };
  }

  it('authors, reloads and replaces a rubric; validates it; locks it once submissions are scored', async () => {
    const f = await fixture();
    const saved = await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never);
    expect(saved).toMatchObject({ editable: true, totalPoints: 10 });
    expect(saved.criteria.map((c) => [c.ordinal, c.title, c.maxPoints])).toEqual([[1, 'Sequence', 6], [2, 'Safety', 4]]);
    await expect(config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, { criteria: [{ title: 'A', maxPoints: 1 }, { title: 'a', maxPoints: 1 }] } as never)).rejects.toThrow(/distinct/);
    await expect(config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, { criteria: [{ title: 'A', maxPoints: 5000 }] } as never)).rejects.toThrow(/1000/);
    expect((await config.getRubric(f.teacher, f.x.room.id, f.assignment.id)).criteria).toHaveLength(2); // failed replacements changed nothing
    const replaced = await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, { criteria: [{ title: 'Only', maxPoints: 3 }] } as never);
    expect(replaced.totalPoints).toBe(3);
    const { submission } = await submit(f);
    await assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: replaced.criteria[0].id, awardedPoints: 2 }] } as never);
    await expect(config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never)).rejects.toMatchObject({ response: { code: 'RUBRIC_IN_USE' } });
    expect(await config.getRubric(f.teacher, f.x.room.id, f.assignment.id)).toMatchObject({ editable: false });
  });

  it('refuses a rubric for quizzes and for classrooms the assignment is not delivered to', async () => {
    const f = await fixture();
    const quiz = await db.learning_assignments.create({ data: { lesson_id: f.x.lesson.id, title: 'Q', instructions: '', constraints: { kind: 'knowledge_check', passPercent: 80 } } });
    await db.learning_classroom_assignments.create({ data: { classroom_id: f.x.room.id, assignment_id: quiz.id, status: 'draft' } });
    await expect(config.replaceRubric(f.teacher, f.x.room.id, quiz.id, rubric as never)).rejects.toMatchObject({ response: { code: 'QUIZ_HAS_NO_RUBRIC' } });
    const other = await fixture();
    await expect(config.getRubric(f.teacher, other.x.room.id, f.assignment.id)).rejects.toThrow();
  });

  it('denies rubric, schedule, assess, release and reopen to students and to another school', async () => {
    const f = await fixture(); const { attempt, submission } = await submit(f);
    await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never);
    const [crit] = (await config.getRubric(f.teacher, f.x.room.id, f.assignment.id)).criteria;
    for (const who of [f.outsider, f.user]) {
      await expect(config.replaceRubric(who, f.x.room.id, f.assignment.id, rubric as never)).rejects.toThrow();
      await expect(config.updateSchedule(who, f.x.room.id, f.assignment.id, { maxAttempts: 2 } as never)).rejects.toThrow();
      await expect(assessment.assess(who, submission.id, { scores: [{ criterionId: crit.id, awardedPoints: 1 }] } as never)).rejects.toThrow();
      await expect(assessment.releaseSubmission(who, submission.id)).rejects.toThrow();
      await expect(assessment.reopenGrading(who, attempt.id, 'trying to cheat')).rejects.toThrow();
    }
    expect(await db.learning_assessments.count({ where: { submission_id: submission.id } })).toBe(0);
  });

  it('validates rubric scores: unknown criterion, duplicates, above-maximum; partial credit is stored as awarded', async () => {
    const f = await fixture(); const { submission } = await submit(f);
    const saved = await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never);
    const [a, b] = saved.criteria;
    await expect(assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: a.id, awardedPoints: 6.5 }] } as never)).rejects.toThrow(/exceed/);
    await expect(assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: a.id, awardedPoints: 1 }, { criterionId: a.id, awardedPoints: 2 }] } as never)).rejects.toThrow(/distinct/);
    await expect(assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: '11111111-1111-4111-8111-111111111111', awardedPoints: 1 }] } as never)).rejects.toThrow(/criteria/);
    const detail = await assessment.assess(f.teacher, submission.id, { overallFeedback: 'partly', scores: [{ criterionId: a.id, awardedPoints: 4.5 }, { criterionId: b.id, awardedPoints: 4 }] } as never) as Array<Record<string, any>>;
    expect(JSON.stringify(detail)).toContain('4.5');
  });

  it('keeps grading invisible to the student until release; then shows it; reopening hides it again with an audit snapshot, and a corrected grade can be re-released', async () => {
    const f = await fixture(); const { attempt, submission } = await submit(f);
    const [a, b] = (await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never)).criteria;
    await assessment.assess(f.teacher, submission.id, { overallFeedback: 'first', scores: [{ criterionId: a.id, awardedPoints: 3 }] } as never);   // partial draft is allowed
    expect(await assessment.myGrading(f.user, attempt.id)).toEqual({ attemptId: attempt.id, released: false });
    await expect(assessment.releaseSubmission(f.teacher, submission.id)).rejects.toMatchObject({ response: { code: 'RUBRIC_INCOMPLETE' } });          // D-06: every criterion must be graded
    await assessment.assess(f.teacher, submission.id, { overallFeedback: 'first', scores: [{ criterionId: a.id, awardedPoints: 3 }, { criterionId: b.id, awardedPoints: 0 }] } as never);   // explicit zero is graded
    await assessment.releaseSubmission(f.teacher, submission.id);
    expect(await assessment.myGrading(f.user, attempt.id)).toMatchObject({ released: true, assessment: { overallFeedback: 'first' } });

    await expect(assessment.reopenGrading(f.teacher, attempt.id, '  ')).rejects.toThrow(/reason/);
    await expect(assessment.reopenGrading(f.teacher, attempt.id, 'Mis-scored the sequence criterion')).resolves.toMatchObject({ reopened: true });
    expect(await assessment.myGrading(f.user, attempt.id)).toEqual({ attemptId: attempt.id, released: false });
    await assessment.assess(f.teacher, submission.id, { overallFeedback: 'corrected', scores: [{ criterionId: a.id, awardedPoints: 5 }] } as never);
    await assessment.releaseSubmission(f.teacher, submission.id);
    expect(await assessment.myGrading(f.user, attempt.id)).toMatchObject({ released: true, assessment: { overallFeedback: 'corrected' } });

    const history = await db.$queryRaw<Array<Record<string, any>>>`SELECT action,actor_user_id AS "actorUserId",details FROM public.audit_logs WHERE target_type='learning_assignment_attempt' AND target_id=${attempt.id}::uuid ORDER BY created_at`;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ action: 'grading.release_withdrawn', actorUserId: f.teacher.vistaUserId });
    expect(history[0].details.reason).toBe('Mis-scored the sequence criterion');
    expect(history[0].details.withdrawn.assessment.overallFeedback).toBe('first');
    expect(history[0].details.withdrawn.assessment.scores.find((x: any) => x.criterionId === a.id).awardedPoints).toBe(3);
    await expect(assessment.reopenGrading(f.teacher, attempt.id, 'second reopen')).resolves.toBeDefined(); // released again → reopenable again
  });

  it('D-06 release gate: feedback-only and partial drafts are saved but cannot be released; explicit zero counts as graded; a non-rubric assignment keeps its behaviour', async () => {
    const f = await fixture(); const { attempt, submission } = await submit(f);
    const [a, b] = (await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never)).criteria;
    await assessment.feedback(f.teacher, submission.id, { content: 'draft note' } as never);                                              // feedback-only draft
    await expect(assessment.releaseSubmission(f.teacher, submission.id)).rejects.toMatchObject({ response: { code: 'RUBRIC_INCOMPLETE' } });
    await assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: a.id, awardedPoints: 0 }] } as never);                    // zero is a grade, one criterion still missing
    await expect(assessment.releaseSubmission(f.teacher, submission.id)).rejects.toMatchObject({ response: { code: 'RUBRIC_INCOMPLETE', message: expect.stringContaining('1 of 2') } });
    await assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: b.id, awardedPoints: 0 }] } as never);
    await expect(assessment.releaseSubmission(f.teacher, submission.id)).resolves.toMatchObject({ released: true });
    const grading = await assessment.myGrading(f.user, attempt.id) as unknown as { summary: Record<string, unknown> };
    expect(grading.summary).toMatchObject({ awarded: 0, max: 10, percentage: 0, complete: true, rating: 'Needs Review' });
    await expect(assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: a.id, awardedPoints: 6 }] } as never)).rejects.toMatchObject({ response: { code: 'GRADE_RELEASED' } });   // locked after release
    const plain = await fixture(); const second = await submit(plain);                                                                      // no rubric criteria: unchanged
    await assessment.feedback(plain.teacher, second.submission.id, { content: 'good work' } as never);
    await expect(assessment.releaseSubmission(plain.teacher, second.submission.id)).resolves.toMatchObject({ released: true });
  });

  it('Gradebook (real PostgreSQL): partial draft -> partial; complete with an explicit zero -> complete; the canonical summary matches the student result; attempt.score stays untouched', async () => {
    const f = await fixture(); const { attempt, submission } = await submit(f);
    const [a, b] = (await config.replaceRubric(f.teacher, f.x.room.id, f.assignment.id, rubric as never)).criteria;
    await assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: a.id, awardedPoints: 6 }] } as never);
    const partial = (await insights.gradebook(f.teacher, f.x.room.id) as Array<Record<string, any>>).find((r) => r.attemptId === attempt.id)!;
    expect(partial).toMatchObject({ resultKind: 'rubric', graded: 'partial', released: false, percentage: 60 });
    expect(partial.rubric).toMatchObject({ awarded: 6, max: 10, gradedCriteria: 1, totalCriteria: 2, complete: false });
    await assessment.assess(f.teacher, submission.id, { scores: [{ criterionId: b.id, awardedPoints: 0 }] } as never);
    await assessment.releaseSubmission(f.teacher, submission.id);
    const done = (await insights.gradebook(f.teacher, f.x.room.id) as Array<Record<string, any>>).find((r) => r.attemptId === attempt.id)!;
    expect(done).toMatchObject({ graded: 'complete', released: true, percentage: 60 });
    const student = await assessment.myGrading(f.user, attempt.id) as unknown as { summary: { percentage: number }; score: number | null };
    expect(student.summary.percentage).toBe(done.percentage);          // student, instructor and Gradebook agree
    expect(student.score).toBeNull();                                    // attempt.score is never overwritten by a rubric
  });

  it('cannot reopen what was never released or what the system auto-released', async () => {
    const f = await fixture(); const { attempt } = await submit(f);
    await expect(assessment.reopenGrading(f.teacher, attempt.id, 'not released yet')).rejects.toMatchObject({ response: { code: 'GRADE_NOT_RELEASED' } });
    await db.learning_assignment_attempts.update({ where: { id: attempt.id }, data: { grading_released_at: new Date(), grading_release_origin: 'system_auto' } });
    await expect(assessment.reopenGrading(f.teacher, attempt.id, 'machine graded quiz')).rejects.toMatchObject({ response: { code: 'AUTO_GRADE_NOT_REOPENABLE' } });
  });

  it('configures the delivery schedule: validates ordering, persists, refuses closed deliveries and enforces the window on new attempts', async () => {
    const f = await fixture();
    const base = Date.now();
    const iso = (ms: number) => new Date(base + ms).toISOString();
    const set = await config.updateSchedule(f.teacher, f.x.room.id, f.assignment.id, { availableFrom: iso(-3600_000), dueAt: iso(3600_000), closeAt: iso(7200_000), maxAttempts: 2 } as never);
    expect(set).toMatchObject({ max_attempts: 2 });
    await expect(config.updateSchedule(f.teacher, f.x.room.id, f.assignment.id, { dueAt: iso(-7200_000) } as never)).rejects.toThrow(/after the opening/);
    await expect(config.updateSchedule(f.teacher, f.x.room.id, f.assignment.id, { closeAt: iso(60_000) } as never)).rejects.toThrow(/not be before the due/);
    await config.updateSchedule(f.teacher, f.x.room.id, f.assignment.id, { closeAt: iso(-60_000), dueAt: null, availableFrom: null } as never);
    await expect(learning.startAttempt(f.user, f.delivery.id)).rejects.toThrow(); // window closed
    await db.learning_classroom_assignments.update({ where: { id: f.delivery.id }, data: { status: 'closed' } });
    await expect(config.updateSchedule(f.teacher, f.x.room.id, f.assignment.id, { maxAttempts: 3 } as never)).rejects.toMatchObject({ response: { code: 'DELIVERY_NOT_EDITABLE' } });
  });
});
