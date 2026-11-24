import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { createDb, describeDb, type Db } from './db-test-support';
import { LearningScopeService } from './learning-scope.service';
import { RECORDING_SCHEMA, objectKey } from './robot-recording.contract';
import { RobotRecordingService } from './robot-recording.service';

/**
 * WF04: an instructor reaches a recording only through a submission of a classroom they may review (`learning.work.review`),
 * for an experiment of that submission. Other classrooms, other organisations, missing permission, a mismatched submission and
 * students are all answered with "not found". Storage is an in-memory stand-in for the private bucket.
 */
describeDb('Robot recordings: instructor access (PostgreSQL)', () => {
  const db: Db = createDb();
  const SHA = 'e'.repeat(64);
  const objects = new Map<string, { contentLength: number; sha256: string }>();
  const manifests = new Map<string, unknown>();
  const storage = {
    enabled: () => true,
    readManifest: async (key: string) => manifests.get(key) ?? null,
    head: async (key: string) => objects.get(key) ?? null,
    download: async (key: string) => `https://signed.example/${key}`,
  };
  let service: RobotRecordingService;
  beforeAll(async () => { await db.$connect(); service = new RobotRecordingService(db as never, storage as never, undefined, new LearningScopeService(db as never)); });
  afterAll(async () => { await db.$disconnect(); });

  const asUser = (id: string) => ({ authUserId: 'a', vistaUserId: id, email: 'x@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] }) as never;

  async function world() {
    const s = randomUUID().slice(0, 8);
    const org = await db.organizations.create({ data: { name: `rec ${s}`, type: 'institution', segment: 'education' } });
    const studentRole = await db.roles.create({ data: { code: `student-${s}`, name: 'Student', scope: 'organization' } });
    const course = await db.learning_courses.create({ data: { title: `C ${s}`, status: 'published' } });
    const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
    const offering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: org.id, code: `o-${s}`, status: 'active' } });
    const room = await db.learning_classrooms.create({ data: { organization_id: org.id, offering_id: offering.id, name: 'A', code: `a-${s}` } });
    const assignment = await db.learning_assignments.create({ data: { lesson_id: lesson.id, title: 'A', instructions: '', constraints: { kind: 'symbolic_program' } } });
    const delivery = await db.learning_classroom_assignments.create({ data: { classroom_id: room.id, assignment_id: assignment.id, status: 'published' } });
    return { org, studentRole, room, assignment, delivery };
  }
  type World = Awaited<ReturnType<typeof world>>;

  async function submittedRun(x: World) {
    const program = { kind: 'robot_program', schemaVersion: 1, steps: [{ type: 'home' }] };
    const u = await db.users.create({ data: { full_name: 'S', signup_method: 'admin_created', status: 'active' } });
    const m = await db.memberships.create({ data: { user_id: u.id, organization_id: x.org.id, role_id: x.studentRole.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: x.room.id, user_id: u.id, membership_id: m.id, classroom_role: 'student', status: 'active' } });
    const prog = await db.learning_programs.create({ data: { owner_user_id: u.id, assignment_id: x.assignment.id, robot_program: program } });
    const version = await db.learning_program_versions.create({ data: { program_id: prog.id, version_number: 1, robot_program: program } });
    const attempt = await db.learning_assignment_attempts.create({ data: { classroom_assignment_id: x.delivery.id, learner_user_id: u.id, attempt_number: 1, program_id: prog.id } });
    const submission = await db.learning_submissions.create({ data: { assignment_id: x.assignment.id, learner_user_id: u.id, program_id: prog.id, program_version_id: version.id, status: 'submitted', attempt_id: attempt.id } });
    const robot = await db.robots.create({ data: { name: `R-${randomUUID().slice(0, 6)}`, serial_no: `S-${randomUUID()}`, model_name: 'SO-101', status: 'available' } });
    const mode = await db.control_modes.upsert({ where: { code: 'blockly' }, update: {}, create: { code: 'blockly', description: 'test' } });
    const profile = await db.safety_profiles.create({ data: { name: `p-${randomUUID()}`, max_speed_pct: 1, workspace_limit: {}, max_session_minutes: 2, allowed_modes: ['blockly'] } });
    const session = await db.control_sessions.create({ data: { organization_id: x.org.id, membership_id: m.id, robot_id: robot.id, mode_id: mode.id, safety_profile_id: profile.id } });
    const experiment = await db.learning_experiments.create({ data: { submission_id: submission.id, learner_user_id: u.id, method: 'blockly', execution_mode: 'real_robot', control_session_id: session.id, input_snapshot: { robotId: robot.id, classroomId: x.room.id } } });
    const episodeId = randomUUID();
    const files = ['trajectory.ndjson', 'front.mp4'].map((name) => ({ name, sizeBytes: 500, sha256: SHA, contentType: name.endsWith('.mp4') ? 'video/mp4' : 'application/x-ndjson', artifactType: name.endsWith('.mp4') ? 'video' : 'trajectory' }));
    for (const f of files) objects.set(objectKey(robot.id, experiment.id, episodeId, f.name), { contentLength: 500, sha256: SHA });
    const manifestKey = objectKey(robot.id, experiment.id, episodeId, 'manifest.json');
    manifests.set(manifestKey, { schema: RECORDING_SCHEMA, episodeId, robotId: robot.id, experimentId: experiment.id, startedAtMs: 1, endedAtMs: 2, declaredRuntimeKind: 'MOCK_RUNTIME', files });
    await service.register(manifestKey);
    const artifact = await db.learning_experiment_artifacts.findFirstOrThrow({ where: { experiment_id: experiment.id } });
    return { student: u, submission, experiment, artifact };
  }

  async function staff(x: World, permissions: string[], classroomRole = 'teacher') {
    const s = randomUUID().slice(0, 8);
    const role = await db.roles.create({ data: { code: `staff-${s}`, name: 'Staff', scope: 'organization' } });
    for (const code of permissions) {
      const permission = (await db.permissions.findFirst({ where: { code } })) ?? await db.permissions.create({ data: { code } });
      await db.role_permissions.create({ data: { role_id: role.id, permission_id: permission.id } });
    }
    const user = await db.users.create({ data: { full_name: 'T', signup_method: 'admin_created', status: 'active' } });
    const membership = await db.memberships.create({ data: { user_id: user.id, organization_id: x.org.id, role_id: role.id, status: 'active' } });
    await db.learning_classroom_members.create({ data: { classroom_id: x.room.id, user_id: user.id, membership_id: membership.id, classroom_role: classroomRole, status: 'active' } });
    return asUser(user.id);
  }

  it('lets a reviewing teacher of the classroom list and fetch the recording, still marked as an unverified runtime', async () => {
    const x = await world(); const run = await submittedRun(x);
    const teacher = await staff(x, ['learning.work.review']);
    const list = await service.instructorList(teacher, run.submission.id, run.experiment.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ runtimeVerified: false, declaredRuntimeKind: 'MOCK_RUNTIME', availability: 'available' });
    expect(list[0].downloadPath).toContain(`/submissions/${run.submission.id}/experiments/${run.experiment.id}/recordings/`);
    await expect(service.instructorDownload(teacher, run.submission.id, run.experiment.id, run.artifact.id)).resolves.toMatchObject({ expiresInSeconds: 300 });
  });

  it('answers not found for a teacher without learning.work.review, for a student, and for a teacher of another classroom or organisation', async () => {
    const x = await world(); const run = await submittedRun(x);
    const noPermission = await staff(x, ['learning.delivery.manage']);
    const classmate = asUser(run.student.id);
    const other = await world(); await submittedRun(other);
    const foreign = await staff(other, ['learning.work.review']);
    for (const caller of [noPermission, classmate, foreign]) {
      await expect(service.instructorList(caller, run.submission.id, run.experiment.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.instructorDownload(caller, run.submission.id, run.experiment.id, run.artifact.id)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('does not let a submission of one student expose the experiment of another, nor an artifact of a different experiment', async () => {
    const x = await world(); const a = await submittedRun(x); const b = await submittedRun(x);
    const teacher = await staff(x, ['learning.work.review']);
    await expect(service.instructorList(teacher, a.submission.id, b.experiment.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.instructorDownload(teacher, a.submission.id, a.experiment.id, b.artifact.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
