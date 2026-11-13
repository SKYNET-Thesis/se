import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { AssessmentService } from './assessment.service';
import { createDb, createSystemAdmin, createStudent, createWorld, describeDb, joinClassroom, type Db, type World } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { ProgrammingService } from './programming.service';
import { ProgressionService } from './progression.service';

/** Real PostgreSQL checks for the instructor assignment management read models and the released-grade policy. */
const program = { schemaVersion: 1, kind: 'robot_program', steps: [{ type: 'wait', durationMs: 100 }] };

describeDb('real PostgreSQL instructor assignment management', () => {
  jest.setTimeout(30_000);
  const db = (describeDb === describe ? createDb() : undefined) as unknown as Db;
  let learning: LearningService; let programming: ProgrammingService; let assessment: AssessmentService; let enrollments: EnrollmentDeliveryService;
  beforeAll(async () => {
    await db.$connect();
    const scope = new LearningScopeService(db as never);
    enrollments = new EnrollmentDeliveryService(db as never);
    const progression = new ProgressionService(db as never, scope);
    learning = new LearningService(db as never, scope, progression, enrollments);
    programming = new ProgrammingService(db as never, scope);
    assessment = new AssessmentService(db as never, scope);
  });
  afterAll(async () => { await db.$disconnect(); });

  async function fixture() {
    const x: World = await createWorld(db);
    const assignment = await db.learning_assignments.create({ data: { lesson_id: x.lesson.id, title: 'Gripper', instructions: 'Do it' } });
    const criterion = await db.learning_rubric_criteria.create({ data: { assignment_id: assignment.id, title: 'Sequence', max_points: 10, ordinal: 1 } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: x.room.id, assignment_id: assignment.id, status: 'published' } });
    const s = await createStudent(db, x); await joinClassroom(db, s, x.room.id); await enrollments.synchronizeClassroom(x.room.id);
    const user = { authUserId: 'a', vistaUserId: s.user.id, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: s.membership.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write'] }] } as never;
    const teacher = await createSystemAdmin(db);
    return { x, assignment, criterion, delivery, s, user, teacher };
  }
  async function submit(f: Awaited<ReturnType<typeof fixture>>) {
    const attempt = await learning.startAttempt(f.user, f.delivery.id) as { id: string };
    const created = await programming.createProgram(f.user, attempt.id, { title: 'P', workspaceJson: { blocks: [] }, robotProgram: program });
    const version = await programming.createVersion(f.user, created.id, { changeSummary: 'v' });
    const submission = await programming.submit(f.user, attempt.id, { programVersionId: version.id }) as { id: string };
    return { attempt, submission };
  }
  const mine = async (f: Awaited<ReturnType<typeof fixture>>) => (await learning.myLearning(f.user) as Array<Record<string, any>>).find((item) => item.classroom_assignment_id === f.delivery.id)!;

  it('reports the persisted rubric maximum as score_max, and nothing before release', async () => {
    const f = await fixture(); const { submission } = await submit(f);
    await assessment.assess(f.teacher, submission.id, { overallFeedback: 'ok', scores: [{ criterionId: f.criterion.id, awardedPoints: 9 }] } as never);
    const before = await mine(f);
    expect(before.score).toBeNull(); expect(before.score_max).toBeNull();
    await assessment.releaseSubmission(f.teacher, submission.id);
    const after = await mine(f);
    expect(after.score).toBe(9); expect(after.score_max).toBe(10);
  });

  it('makes a released grade immutable: assess and feedback are rejected and nothing changes', async () => {
    const f = await fixture(); const { attempt, submission } = await submit(f);
    await assessment.assess(f.teacher, submission.id, { overallFeedback: 'first', scores: [{ criterionId: f.criterion.id, awardedPoints: 9 }] } as never);
    await assessment.releaseSubmission(f.teacher, submission.id);
    await expect(assessment.assess(f.teacher, submission.id, { overallFeedback: 'changed', scores: [{ criterionId: f.criterion.id, awardedPoints: 2 }] } as never))
      .rejects.toMatchObject({ response: { code: 'GRADE_RELEASED' } });
    await expect(assessment.feedback(f.teacher, submission.id, { content: 'late note' } as never)).rejects.toBeInstanceOf(ConflictException);
    const detail = await assessment.instructorSubmission(f.teacher, submission.id) as Record<string, any>;
    expect(detail.assessment.overallFeedback).toBe('first'); expect(detail.assessment.scores[0].awardedPoints).toBe(9); expect(detail.feedback).toHaveLength(0);
    const grading = await assessment.myGrading(f.user, attempt.id) as Record<string, any>;
    expect(grading.assessment.overallFeedback).toBe('first');
    // release stays idempotent
    await expect(assessment.releaseSubmission(f.teacher, submission.id)).resolves.toMatchObject({ released: true });
  });

  it('counts enrolled students (active enrollment AND active membership), not raw membership', async () => {
    const f = await fixture();
    const noEnrollment = await createStudent(db, f.x); await joinClassroom(db, noEnrollment, f.x.room.id); // member only, as a direct-DB seed would leave them
    const rooms = await learning.teachingClassrooms(f.teacher) as Array<Record<string, any>>;
    const room = rooms.find((item) => item.id === f.x.room.id)!;
    expect(room.student_count).toBe(2); expect(room.enrolled_student_count).toBe(1);
    // teaching-staff branch (non system administrator)
    const permission = await db.permissions.upsert({ where: { code: 'learning.delivery.manage' } as never, create: { code: 'learning.delivery.manage' }, update: {} }).catch(async () => (await db.permissions.findFirst({ where: { code: 'learning.delivery.manage' } }))!);
    const role = await db.roles.create({ data: { code: `teacher-${randomUUID().slice(0, 8)}`, name: 'Teacher', scope: 'organization' } });
    await db.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    const user = await db.users.create({ data: { full_name: 'Teacher', signup_method: 'admin_created', status: 'active' } });
    const membership = await db.memberships.create({ data: { user_id: user.id, organization_id: f.x.org.id, role_id: role.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: f.x.room.id, user_id: user.id, membership_id: membership.id, classroom_role: 'teacher', status: 'active' } });
    const asTeacher = { authUserId: 'a', vistaUserId: user.id, email: 't@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] } as never;
    const own = (await learning.teachingClassrooms(asTeacher) as Array<Record<string, any>>).find((item) => item.id === f.x.room.id)!;
    expect(own.student_count).toBe(2); expect(own.enrolled_student_count).toBe(1);
  });

  it('copies the lesson rubric into a newly created assignment (and the template stays untouched)', async () => {
    const f = await fixture();
    const created = await learning.createAssignment(f.teacher, f.x.room.id, { lessonId: f.x.lesson.id, title: 'Second gripper task' } as never) as { assignment_id: string };
    const copied = await db.learning_rubric_criteria.findMany({ where: { assignment_id: created.assignment_id } });
    expect(copied.map((item) => [item.title, Number(item.max_points), item.ordinal])).toEqual([['Sequence', 10, 1]]);
    expect(copied[0].id).not.toBe(f.criterion.id);
    expect(await db.learning_rubric_criteria.count({ where: { assignment_id: f.assignment.id } })).toBe(1);
    const options = await learning.deliveryOptions(f.teacher, f.x.room.id) as Array<Record<string, any>>;
    expect(options[0].rubric).toEqual([{ title: 'Sequence', description: null, maxPoints: 10 }]);
  });
});
