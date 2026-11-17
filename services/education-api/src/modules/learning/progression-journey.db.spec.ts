import { ActivityProgressService } from './activity-progress.service';
import { createDb, createStudent, createSystemAdmin, createWorld, describeDb, joinClassroom, schoolAdminUser, type Db } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningInsightsService } from './learning-insights.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { ProgressionService } from './progression.service';
import { QuestionBankService } from './question-bank.service';

/** Real PostgreSQL: quiz threshold → lesson completion → prerequisite unlock, retakes, attempt limits, direct-access and tenant checks. */
describeDb('real PostgreSQL learning progression journey', () => {
  jest.setTimeout(60_000);
  const db: Db = createDb();
  let learning: LearningService; let progression: ProgressionService; let activities: ActivityProgressService; let insights: LearningInsightsService; let bank: QuestionBankService; let enrollments: EnrollmentDeliveryService;
  beforeAll(async () => {
    await db.$connect();
    const scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    progression = new ProgressionService(db as never, scope);
    learning = new LearningService(db as never, scope, progression, enrollments);
    activities = new ActivityProgressService(db as never, progression);
    insights = new LearningInsightsService(db as never, scope);
    bank = new QuestionBankService(db as never);
  });
  afterAll(async () => { await db.$disconnect(); });

  const content = (stem: string) => ({ type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'understand', stem, options: [{ id: 'a', text: 'Yes' }, { id: 'b', text: 'No' }], answerKey: ['a'], explanation: 'because' });

  async function fixture() {
    const admin = await createSystemAdmin(db);
    const x = await createWorld(db);
    const section1 = await db.learning_sections.findFirstOrThrow({ where: { lesson_id: x.lesson.id } });
    const reading1 = await db.learning_activities.findFirstOrThrow({ where: { section_id: section1.id } });
    const lesson2 = await db.learning_lessons.create({ data: { course_id: x.course.id, title: 'L2', ordinal: 2 } });
    const section2 = await db.learning_sections.create({ data: { lesson_id: lesson2.id, title: 'S2', ordinal: 1, status: 'published' } });
    await db.learning_activities.create({ data: { section_id: section2.id, title: 'A2', type: 'reading', ordinal: 1, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, blocks: [{ type: 'paragraph', text: 'x' }], mediaIds: [] } } });
    await db.learning_lesson_prerequisites.create({ data: { lesson_id: lesson2.id, prerequisite_lesson_id: x.lesson.id, required: true } });
    // weighted quiz (3 + 1 points, 60% to pass) bound to lesson 1 through a required knowledge_check activity
    const objective = await db.learning_objectives.create({ data: { lesson_id: x.lesson.id, code: `O-${x.suffix}`, description: 'Obj' } });
    const versions: string[] = [];
    for (const stem of ['Heavy question', 'Light question']) {
      const q = await bank.createQuestion(admin, { courseId: x.course.id, lessonId: x.lesson.id, code: `${stem}-${x.suffix}` } as never);
      const v = await bank.createVersion(admin, q.id, content(stem) as never);
      await bank.mapObjectives(admin, v.id, { objectiveIds: [objective.id] } as never);
      await bank.submitReview(admin, v.id); await bank.publish(admin, v.id); versions.push(v.id);
    }
    const quiz = await bank.createQuizAssignment(admin, x.lesson.id, 'Quiz', 'go', 60);
    await bank.addToAssignment(admin, quiz.id, { questionVersionId: versions[0], ordinal: 1, points: 3 } as never);
    await bank.addToAssignment(admin, quiz.id, { questionVersionId: versions[1], ordinal: 2, points: 1 } as never);
    await db.learning_activities.create({ data: { section_id: section1.id, title: 'Quiz', type: 'knowledge_check', ordinal: 2, status: 'published', required: true, content_ref: { kind: 'assignment', id: quiz.id }, content: { version: 1, blocks: [], mediaIds: [] } } });
    const quizDelivery = await learning.createQuizDelivery(admin, x.room.id, { canonicalAssignmentId: quiz.id, maxAttempts: 2 } as never) as { id: string };
    await learning.publishAssignment(admin, x.room.id, quiz.id);
    // an ordinary assignment on lesson 2 (restricted until lesson 1 is complete)
    const a2 = await db.learning_assignments.create({ data: { lesson_id: lesson2.id, title: 'Lesson 2 work', instructions: '' } });
    const a2Delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: a2.id, status: 'published' } });
    const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id); await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: s.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: s.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    return { x, admin, reading1, lesson2, quiz, quizDelivery, a2Delivery, versions, s, user };
  }
  type F = Awaited<ReturnType<typeof fixture>>;
  const answers = (f: F, heavy: 'a' | 'b', light: 'a' | 'b') => ({ answers: [{ questionId: f.versions[0], optionId: heavy }, { questionId: f.versions[1], optionId: light }] }) as never;
  const lessonStatus = async (f: F, lessonId: string) => (await progression.coursePath(f.user, f.x.course.id)).lessons.find((l) => l.id === lessonId)!.status;

  it('quiz fail keeps restricted content locked; retake pass completes the lesson and unlocks the next; attempt limit and direct access are enforced', async () => {
    const f = await fixture();
    expect(await lessonStatus(f, f.lesson2.id)).toBe('locked');
    // direct API access to restricted content is refused before the prerequisite is met
    await expect(learning.startAttempt(f.user, f.a2Delivery.id)).rejects.toThrow();

    await activities.completeSelfReport(f.user, f.reading1.id);
    // attempt 1: heavy wrong, light right = 1/4 = 25% < 60% → fail
    const a1 = await learning.startAttempt(f.user, f.quizDelivery.id) as { id: string };
    const r1 = await progression.submitKnowledgeCheck(f.user, a1.id, answers(f, 'b', 'a')) as Record<string, any>;
    expect(r1).toMatchObject({ passed: false, score: 25, earnedPoints: 1, possiblePoints: 4, completedLessonId: null });
    expect(r1.newlyUnlockedLessonIds).toEqual([]);
    expect(await lessonStatus(f, f.lesson2.id)).toBe('locked');
    await expect(learning.startAttempt(f.user, f.a2Delivery.id)).rejects.toThrow();
    expect((await progression.coursePath(f.user, f.x.course.id)).progressPercent).toBe(0);

    // a resubmission of the evaluated attempt returns the stored result and cannot flip it
    expect(await progression.submitKnowledgeCheck(f.user, a1.id, answers(f, 'a', 'a'))).toMatchObject({ passed: false, score: 25 });

    // retake (attempt 2): heavy right, light wrong = 75% ≥ 60% → pass
    const a2 = await learning.startAttempt(f.user, f.quizDelivery.id) as { id: string };
    expect(a2.id).not.toBe(a1.id);
    const r2 = await progression.submitKnowledgeCheck(f.user, a2.id, answers(f, 'a', 'b')) as Record<string, any>;
    expect(r2).toMatchObject({ passed: true, score: 75, completedLessonId: f.x.lesson.id });
    expect(r2.newlyUnlockedLessonIds).toContain(f.lesson2.id);
    const path = await progression.coursePath(f.user, f.x.course.id);
    expect(path.lessons.find((l) => l.id === f.x.lesson.id)!.status).toBe('completed');
    expect(path.lessons.find((l) => l.id === f.lesson2.id)!.status).not.toBe('locked');
    expect(path.progressPercent).toBe(50);
    await expect(learning.startAttempt(f.user, f.a2Delivery.id)).resolves.toBeDefined(); // now unlocked

    // attempt limit (2) reached: no third attempt, history keeps both with their own scores
    await expect(learning.startAttempt(f.user, f.quizDelivery.id)).rejects.toThrow();
    const history = await learning.attemptHistory(f.user, f.quizDelivery.id) as Array<Record<string, any>>;
    expect(history.map((h) => [h.attempt_number, Number(h.score), h.passed])).toEqual([[2, 75, true], [1, 25, false]]);
  });

  it('shows the instructor each learner\'s progress with the same rule as the student path, and denies other schools and students', async () => {
    const f = await fixture();
    const before = await insights.learnerProgress(f.admin, f.x.room.id);
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({ learnerUserId: f.s.user.id, lessonCount: 2, lessonsCompleted: 0, progressPercent: 0, attemptsSubmitted: 0, bestScore: null });
    await activities.completeSelfReport(f.user, f.reading1.id);
    const a = await learning.startAttempt(f.user, f.quizDelivery.id) as { id: string };
    await progression.submitKnowledgeCheck(f.user, a.id, answers(f, 'a', 'a'));
    const after = (await insights.learnerProgress(f.admin, f.x.room.id))[0];
    expect(after).toMatchObject({ lessonsCompleted: 1, progressPercent: 50, attemptsSubmitted: 1, bestScore: 100 });
    expect(after.progressPercent).toBe((await progression.coursePath(f.user, f.x.course.id)).progressPercent);

    const outsider = schoolAdminUser((await createWorld(db)).org.id);
    await expect(insights.learnerProgress(outsider, f.x.room.id)).rejects.toThrow();
    await expect(insights.learnerProgress(f.user, f.x.room.id)).rejects.toThrow();
  });

  it('denies cross-school learners the course path, quiz attempts and self-completion', async () => {
    const f = await fixture();
    const other = await createWorld(db); const os = await createStudent(db, other); await joinClassroom(db, os, other.room.id); await enrollments.synchronizeClassroom(other.room.id);
    const stranger = { authUserId: 'b', vistaUserId: os.user.id, email: 'o@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: os.membership.id, organizationId: other.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    await expect(progression.coursePath(stranger, f.x.course.id)).rejects.toThrow();
    await expect(learning.startAttempt(stranger, f.quizDelivery.id)).rejects.toThrow();
    await expect(activities.completeSelfReport(stranger, f.reading1.id)).rejects.toThrow();
    // another learner's attempt cannot be submitted either
    const a = await learning.startAttempt(f.user, f.quizDelivery.id) as { id: string };
    await expect(progression.submitKnowledgeCheck(stranger, a.id, answers(f, 'a', 'a'))).rejects.toThrow();
  });

  it('lets the instructor review weighted quiz results and one learner\'s per-lesson progress, only within the classroom', async () => {
    const f = await fixture();
    await activities.completeSelfReport(f.user, f.reading1.id);
    const a1 = await learning.startAttempt(f.user, f.quizDelivery.id) as { id: string };
    await progression.submitKnowledgeCheck(f.user, a1.id, answers(f, 'b', 'a'));
    const a2 = await learning.startAttempt(f.user, f.quizDelivery.id) as { id: string };
    await progression.submitKnowledgeCheck(f.user, a2.id, answers(f, 'a', 'a'));

    const results = await insights.quizResults(f.admin, f.x.room.id) as Array<Record<string, any>>;
    expect(results.map((r) => [r.attemptNumber, r.score, r.passed, r.earnedPoints, r.possiblePoints, r.passPercent])).toEqual([[2, 100, true, 4, 4, 60], [1, 25, false, 1, 4, 60]]);
    expect(results[0]).toMatchObject({ learnerUserId: f.s.user.id, quizTitle: 'Quiz' });

    const drill = await insights.learnerLessonProgress(f.admin, f.x.room.id, f.s.user.id);
    expect(drill.lessons.map((l) => [l.ordinal, l.status, l.bestQuizScore, l.attempts])).toEqual([[1, 'completed', 100, 2], [2, 'not_started', null, 0]]);

    // another school's admin, a student, and a learner who is not enrolled in this classroom are all refused
    const outsider = schoolAdminUser((await createWorld(db)).org.id);
    await expect(insights.quizResults(outsider, f.x.room.id)).rejects.toThrow();
    await expect(insights.learnerLessonProgress(outsider, f.x.room.id, f.s.user.id)).rejects.toThrow();
    await expect(insights.quizResults(f.user, f.x.room.id)).rejects.toThrow();
    const other = await createWorld(db); const os = await createStudent(db, other); await joinClassroom(db, os, other.room.id); await enrollments.synchronizeClassroom(other.room.id);
    await expect(insights.learnerLessonProgress(f.admin, f.x.room.id, os.user.id)).rejects.toThrow(/not found/i);
  });
});
