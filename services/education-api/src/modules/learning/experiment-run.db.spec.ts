import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { ExperimentService } from './experiment.service';
import { LearningScopeService } from './learning-scope.service';
import { LearningService } from './learning.service';
import { SchematicEngineService } from './schematic-engine.service';

// Same isolation guard as the other PostgreSQL suites: only the dedicated disposable loopback target.
const requested = process.env.RUN_POSTGRES_INTEGRATION === '1';
const configuredUrl = process.env.VISTA_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const parsedUrl = configuredUrl ? new URL(configuredUrl) : undefined;
const isolatedIdentity = Boolean(
  parsedUrl && ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname) && parsedUrl.port === '55432' &&
  parsedUrl.pathname === '/vista_test_course_builder' && parsedUrl.username === 'vista_test' &&
  process.env.VISTA_DATABASE_PROJECT_REF === 'vista-course-builder-test' && !process.env.SUPABASE_URL,
);
if (requested && !isolatedIdentity) throw new Error('PostgreSQL integration tests require the dedicated vista_test_course_builder target on loopback port 55432.');
const describeDb = requested && isolatedIdentity ? describe : describe.skip;

describeDb('real PostgreSQL ExperimentService.runSchematic authorization', () => {
  const db = (requested && isolatedIdentity ? new PrismaClient({ datasources: { db: { url: configuredUrl } } }) : undefined) as unknown as PrismaClient;
  let enrollments: EnrollmentDeliveryService;
  let service: ExperimentService;
  let learning: LearningService;
  beforeAll(async () => {
    await db.$connect();
    enrollments = new EnrollmentDeliveryService(db as never);
    const scope = new LearningScopeService(db as never);
    service = new ExperimentService(db as never, scope, new SchematicEngineService());
    learning = new LearningService(db as never, scope);
  });
  afterAll(async () => { await db.$disconnect(); });

  const program = { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'arm.select', arm: 'left' }, { type: 'home' }] };
  async function world() {
    const s = randomUUID().slice(0, 8);
    const org = await db.organizations.create({ data: { name: `exp ${s}`, type: 'institution', segment: 'education' } });
    const role = await db.roles.create({ data: { code: `student-${s}`, name: 'Student', scope: 'organization' } });
    const course = await db.learning_courses.create({ data: { title: `C ${s}`, status: 'published' } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
    const offering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: org.id, code: `o-${s}`, status: 'active' } });
    const room = await db.learning_classrooms.create({ data: { organization_id: org.id, offering_id: offering.id, name: 'A', code: `a-${s}` } });
    const assignment = await db.learning_assignments.create({ data: { lesson_id: lesson.id, title: 'A', instructions: '', constraints: { kind: 'symbolic_program' } } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: room.id, assignment_id: assignment.id, status: 'published' } });
    return { org, role, offering, room, assignment, delivery, course };
  }
  type World = Awaited<ReturnType<typeof world>>;
  async function student(x: World) {
    const u = await db.users.create({ data: { full_name: 'L', signup_method: 'admin_created', status: 'active' } });
    const m = await db.memberships.create({ data: { user_id: u.id, organization_id: x.org.id, role_id: x.role.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: x.room.id, user_id: u.id, membership_id: m.id, classroom_role: 'student', status: 'active' } });
    await enrollments.synchronizeClassroom(x.room.id);
    const prog = await db.learning_programs.create({ data: { owner_user_id: u.id, assignment_id: x.assignment.id, robot_program: program } });
    const version = await db.learning_program_versions.create({ data: { program_id: prog.id, version_number: 1, robot_program: program } });
    const attempt = await db.learning_assignment_attempts.create({ data: { classroom_assignment_id: x.delivery.id, learner_user_id: u.id, attempt_number: 1, program_id: prog.id } });
    const sub = await db.learning_submissions.create({ data: { assignment_id: x.assignment.id, learner_user_id: u.id, program_id: prog.id, program_version_id: version.id, status: 'submitted', attempt_id: attempt.id } });
    const exp = await db.learning_experiments.create({ data: { submission_id: sub.id, learner_user_id: u.id, method: 'blockly', execution_mode: 'schematic', input_snapshot: { attemptId: attempt.id, programVersionId: version.id } } });
    const user = { authUserId: 'a', vistaUserId: u.id, email: 'x@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
      memberships: [{ id: m.id, organizationId: x.org.id, roleCode: 'student', status: 'active', permissions: ['learning.work.write', 'learning.experiment.execute'] }] } as never;
    return { u, user, exp };
  }
  const statusOf = async (id: string) => (await db.learning_experiments.findUniqueOrThrow({ where: { id } })).status;

  it('runs a pending experiment for an actively enrolled owner', async () => {
    const x = await world(); const s = await student(x);
    await expect(service.runSchematic(s.user, s.exp.id)).resolves.toBeDefined();
    expect(await statusOf(s.exp.id)).toBe('succeeded');
  });
  it('denies direct invocation after the enrollment is revoked and leaves the experiment pending', async () => {
    const x = await world(); const s = await student(x);
    await enrollments.revokeClassroomEnrollment(x.room.id, s.u.id);
    await expect(service.runSchematic(s.user, s.exp.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await statusOf(s.exp.id)).toBe('pending');
  });
  it('denies after the classroom is archived', async () => {
    const x = await world(); const s = await student(x);
    await db.learning_classrooms.update({ where: { id: x.room.id }, data: { status: 'archived' } });
    await expect(service.runSchematic(s.user, s.exp.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await statusOf(s.exp.id)).toBe('pending');
  });
  it('denies when the offering is no longer active or the classroom moved to another offering (stale enrollment)', async () => {
    const x = await world(); const s = await student(x);
    await db.learning_course_offerings.update({ where: { id: x.offering.id }, data: { status: 'draft' } });
    await expect(service.runSchematic(s.user, s.exp.id)).rejects.toBeInstanceOf(NotFoundException);
    await db.learning_course_offerings.update({ where: { id: x.offering.id }, data: { status: 'active' } });
    const next = await db.learning_course_offerings.create({ data: { course_id: x.course.id, organization_id: x.org.id, code: `n-${randomUUID().slice(0, 8)}`, status: 'active' } });
    await db.learning_classrooms.update({ where: { id: x.room.id }, data: { offering_id: next.id } });
    await expect(service.runSchematic(s.user, s.exp.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await statusOf(s.exp.id)).toBe('pending');
  });
  it("denies another student, including one in the same classroom or another organization, and never runs the victim's experiment", async () => {
    const x = await world(); const a = await student(x); const b = await student(x);
    await expect(service.runSchematic(b.user, a.exp.id)).rejects.toBeInstanceOf(NotFoundException);
    const y = await world(); const outsider = await student(y);
    await expect(service.runSchematic(outsider.user, a.exp.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await statusOf(a.exp.id)).toBe('pending');
  });
  it('assertAttemptWritable (VR / demonstration) follows the same enrollment, archive, stale-offering and ownership rules', async () => {
    const x = await world(); const a = await student(x); const b = await student(x);
    const attemptId = (a.exp.input_snapshot as { attemptId: string }).attemptId;
    await expect(learning.assertAttemptWritable(a.user, attemptId)).resolves.toBeUndefined();
    await expect(learning.assertAttemptWritable(b.user, attemptId)).rejects.toBeInstanceOf(NotFoundException);
    await enrollments.revokeClassroomEnrollment(x.room.id, a.u.id);
    await expect(learning.assertAttemptWritable(a.user, attemptId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(learning.myAttempt(a.user, attemptId)).resolves.toBeDefined(); // preserved history stays readable
  });
});
