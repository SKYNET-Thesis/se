import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import { COURSE_1_BLUEPRINT, seedCourse1 } from "./seed-course1";
import { matchesDisposableDatabaseTarget } from "../modules/learning/isolated-db-target";

const databaseUrl = process.env.VISTA_E2E_ADMIN_DATABASE_URL ?? "";
const fixtureFile = resolve(process.env.VISTA_E2E_FIXTURE_FILE ?? "");
const s3Endpoint = process.env.LEARNING_MEDIA_S3_ENDPOINT ?? "";
const fixturePrefix = "vista-wf03-e2e-fixture";
const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

function assertLocalTargets() {
  const authValue = process.env.SUPABASE_URL;
  const auth = authValue ? new URL(authValue) : undefined;
  const authPort = Number(auth?.port);
  const s3 = new URL(s3Endpoint);
  if (!matchesDisposableDatabaseTarget(databaseUrl) || authValue &&
    !(auth?.protocol === "http:" && auth.hostname === "127.0.0.1" && Number.isInteger(authPort) && authPort >= 1024 && authPort <= 65535 && auth.pathname === "/")) {
    throw new Error("WF-03 E2E fixture requires the exact disposable loopback database and local-only auth.");
  }
  if (s3.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(s3.hostname) || !s3.port) {
    throw new Error("WF-03 E2E fixture requires a loopback-only S3-compatible endpoint.");
  }
  if (dirname(fixtureFile) !== "/tmp" || !fixtureFile.split("/").at(-1)?.startsWith(fixturePrefix)) {
    throw new Error("VISTA_E2E_FIXTURE_FILE must be a direct /tmp/vista-wf03-e2e-fixture*.json file.");
  }
}

async function grant(roleId: string, code: string) {
  const permission = await prisma.permissions.upsert({ where: { code }, create: { code }, update: {} });
  await prisma.role_permissions.upsert({
    where: { role_id_permission_id: { role_id: roleId, permission_id: permission.id } },
    create: { role_id: roleId, permission_id: permission.id }, update: {},
  });
}

async function seed() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const identities = {
    admin: { id: randomUUID(), auth: randomUUID(), email: `wf03-admin-${suffix}@vista.test` },
    instructor: { id: randomUUID(), auth: randomUUID(), email: `wf03-teacher-${suffix}@vista.test` },
    student: { id: randomUUID(), auth: randomUUID(), email: `wf03-student-${suffix}@vista.test` },
    peer: { id: randomUUID(), auth: randomUUID(), email: `wf03-peer-${suffix}@vista.test` },
    foreignTeacher: { id: randomUUID(), auth: randomUUID(), email: `wf03-foreign-teacher-${suffix}@vista.test` },
    foreignStudent: { id: randomUUID(), auth: randomUUID(), email: `wf03-foreign-student-${suffix}@vista.test` },
  };
  const school = await prisma.organizations.create({ data: { name: `WF-03 E2E ${suffix}`, type: "institution", segment: "education", status: "active" } });
  const foreignSchool = await prisma.organizations.create({ data: { name: `WF-03 E2E foreign ${suffix}`, type: "institution", segment: "education", status: "active" } });
  const profile = await prisma.safety_profiles.create({ data: { name: `WF-03 fake follower ${suffix}`, max_speed_pct: 1, workspace_limit: {}, max_session_minutes: 2, allowed_modes: ["blockly"] } });
  const [adminRole, instructorRole, studentRole] = await Promise.all([
    prisma.roles.upsert({ where: { code: "system_admin" }, update: {}, create: { code: "system_admin", name: "System Admin", scope: "system" } }),
    prisma.roles.upsert({ where: { code: "instructor" }, update: {}, create: { code: "instructor", name: "Instructor", scope: "organization" } }),
    prisma.roles.upsert({ where: { code: "student" }, update: { default_safety_profile_id: profile.id }, create: { code: "student", name: "Student", scope: "organization", default_safety_profile_id: profile.id } }),
  ]);
  await Promise.all([
    grant(studentRole.id, "learning.work.write"), grant(studentRole.id, "learning.experiment.execute"),
    grant(instructorRole.id, "learning.work.review"), grant(instructorRole.id, "learning.assessment.assess"),
  ]);
  await prisma.users.createMany({ data: Object.entries(identities).map(([key, value]) => ({
    id: value.id, auth_user_id: value.auth, email: value.email, full_name: `WF-03 ${key} ${suffix}`, signup_method: "admin_created", status: "active",
  })) });
  const [instructorMembership, studentMembership, peerMembership, foreignTeacherMembership, foreignStudentMembership] = await Promise.all([
    prisma.memberships.create({ data: { user_id: identities.instructor.id, organization_id: school.id, role_id: instructorRole.id, status: "active" } }),
    prisma.memberships.create({ data: { user_id: identities.student.id, organization_id: school.id, role_id: studentRole.id, safety_profile_id: profile.id, status: "active" } }),
    prisma.memberships.create({ data: { user_id: identities.peer.id, organization_id: school.id, role_id: studentRole.id, safety_profile_id: profile.id, status: "active" } }),
    prisma.memberships.create({ data: { user_id: identities.foreignTeacher.id, organization_id: foreignSchool.id, role_id: instructorRole.id, status: "active" } }),
    prisma.memberships.create({ data: { user_id: identities.foreignStudent.id, organization_id: foreignSchool.id, role_id: studentRole.id, status: "active" } }),
  ]);
  const course = await seedCourse1(prisma, school.id, identities.admin.id);
  const lessons = await prisma.learning_lessons.findMany({ where: { course_id: course.courseId }, orderBy: { ordinal: "asc" } });
  const l4 = lessons.find((lesson) => lesson.ordinal === 4)!;
  const l5 = lessons.find((lesson) => lesson.ordinal === 5)!;
  const assignments = await prisma.learning_assignments.findMany({ where: { lesson_id: { in: lessons.map((lesson) => lesson.id) } } });
  const offering = await prisma.learning_course_offerings.create({ data: { course_id: course.courseId, organization_id: school.id, code: `WF03-${suffix}`, title: "WF-03 isolated fake-follower E2E", status: "active", created_by: identities.admin.id } });
  const classroom = await prisma.learning_classrooms.create({ data: { organization_id: school.id, offering_id: offering.id, name: `WF-03 E2E ${suffix}`, code: `WF03-${suffix}`, status: "active", created_by: identities.admin.id } });
  const deliveryByAssignment = new Map<string, { id: string }>();
  for (const assignment of assignments) {
    const delivery = await prisma.learning_classroom_assignments.create({ data: { classroom_id: classroom.id, assignment_id: assignment.id, status: "published", published_by: identities.instructor.id } });
    deliveryByAssignment.set(assignment.id, delivery);
  }
  await prisma.learning_classroom_members.createMany({ data: [
    { classroom_id: classroom.id, user_id: identities.instructor.id, membership_id: instructorMembership.id, classroom_role: "teacher", status: "active" },
    { classroom_id: classroom.id, user_id: identities.student.id, membership_id: studentMembership.id, classroom_role: "student", status: "active" },
    { classroom_id: classroom.id, user_id: identities.peer.id, membership_id: peerMembership.id, classroom_role: "student", status: "active" },
  ] });
  await prisma.learning_enrollments.createMany({ data: [identities.student, identities.peer].map((user) => ({ course_id: course.courseId, offering_id: offering.id, classroom_id: classroom.id, learner_user_id: user.id, status: "active" })) });
  await prisma.learning_lesson_progress.createMany({ data: lessons.filter((lesson) => lesson.ordinal < 5).map((lesson) => ({ learner_user_id: identities.student.id, lesson_id: lesson.id, status: "completed", progress_percent: 100, completed_at: new Date() })) });

  // Course 1 lessons use the existing legacy activity adapter. Keep the five workflow lessons available to this fixture learner;
  // qualification and execution remain independently guarded by persisted L4 evidence and authorization scope.
  await prisma.learning_lesson_progress.upsert({
    where: { learner_user_id_lesson_id: { learner_user_id: identities.student.id, lesson_id: l5.id } },
    create: { learner_user_id: identities.student.id, lesson_id: l5.id, status: "in_progress", progress_percent: 0, started_at: new Date() },
    update: { status: "in_progress", started_at: new Date() },
  });
  const targetAssignment = assignments.find((assignment) => assignment.lesson_id === l4.id)!;
  const targetDelivery = deliveryByAssignment.get(targetAssignment.id)!;
  const challenge = await prisma.learning_challenges.findUniqueOrThrow({ where: { id: targetAssignment.challenge_id! } });
  const robot = await prisma.robots.create({ data: { name: `WF-03 fake follower ${suffix}`, serial_no: `WF03-${suffix}`, model_name: "SO-101", status: "available", owner_organization_id: school.id } });
  await prisma.org_entitlements.create({ data: { organization_id: school.id, resource_type: "robot", robot_id: robot.id, valid_from: new Date(Date.now() - 60_000) } });
  await prisma.learning_classroom_robot_allocations.create({ data: { classroom_id: classroom.id, robot_id: robot.id, created_by_user_id: identities.admin.id } });
  const mode = await prisma.control_modes.upsert({ where: { code: "blockly" }, create: { code: "blockly" }, update: {} });
  const program = { kind: "robot_program", schemaVersion: 1, steps: [{ type: "arm.select", arm: "left" }, { type: "home" }, { type: "gripper.open" }, { type: "wait", durationMs: 25 }] };
  const savedProgram = await prisma.learning_programs.create({ data: { owner_user_id: identities.student.id, assignment_id: targetAssignment.id, title: "WF-03 qualified fake-follower program", robot_program: program } });
  const version = await prisma.learning_program_versions.create({ data: { program_id: savedProgram.id, version_number: 1, robot_program: program, created_by: identities.student.id, change_summary: "isolated fake-follower E2E" } });
  const attempt = await prisma.learning_assignment_attempts.create({ data: { classroom_assignment_id: targetDelivery.id, learner_user_id: identities.student.id, program_id: savedProgram.id, attempt_number: 1, status: "submitted", submitted_at: new Date(), program_snapshot: program } });
  const submission = await prisma.learning_submissions.create({ data: { assignment_id: targetAssignment.id, learner_user_id: identities.student.id, program_id: savedProgram.id, program_version_id: version.id, submitted_program: program, status: "submitted", submitted_at: new Date(), attempt_id: attempt.id } });
  const schematic = await prisma.learning_experiments.create({ data: { challenge_id: challenge.id, submission_id: submission.id, learner_user_id: identities.student.id, method: "blockly", execution_mode: "schematic", status: "succeeded", input_snapshot: { attemptId: attempt.id, programVersionId: version.id }, output_snapshot: { schemaVersion: 1, source: "isolated-e2e-fixture" }, started_at: new Date(), ended_at: new Date() } });
  const evaluation = await prisma.learning_symbolic_evaluations.create({ data: {
    experiment_id: schematic.id, submission_id: submission.id, program_version_id: version.id, requested_by_user_id: identities.student.id,
    evaluator_version: "wf03-e2e-fixture", schematic_schema_version: 1, schematic_engine_version: "isolated-e2e-fixture",
    program_hash: "fixture", output_snapshot_hash: "fixture", rule_set_schema_version: 1, rule_set_hash: "fixture",
    rule_set_snapshot: {}, fingerprint: `wf03-e2e-${randomUUID()}`, verdict: "passed", rule_results: [], metrics: {},
  } });
  const bucket = process.env.LEARNING_MEDIA_BUCKET ?? "vista-wf03-e2e";
  if (!/^vista-wf03-e2e-[a-z0-9-]{1,40}$/.test(bucket)) throw new Error("WF-03 E2E requires its dedicated disposable evidence bucket.");
  const s3 = new S3Client({ region: "us-east-1", endpoint: s3Endpoint, forcePathStyle: true });
  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
    if (!new Set(["BucketAlreadyExists", "BucketAlreadyOwnedByYou"]).has(name)) throw error;
  } finally { s3.destroy(); }
  return {
    kind: "vista_wf03_local_e2e_v1", suffix, courseId: course.courseId, l5LessonId: l5.id, classroomId: classroom.id,
    attemptId: attempt.id, submissionId: submission.id, programVersionId: version.id, qualificationId: evaluation.id,
    robotId: robot.id, bucket,
    users: Object.fromEntries(Object.entries(identities).map(([key, value]) => [key, { userId: value.id, authUserId: value.auth }])),
  };
}

async function main() {
  assertLocalTargets();
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) throw new Error("Local S3-compatible credentials are required.");
  await prisma.$connect();
  try {
    const fixture = await seed();
    const handle = await open(fixtureFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(`${JSON.stringify(fixture, null, 2)}\n`);
    await handle.close();
    console.log(JSON.stringify({ fixtureFile, courseId: fixture.courseId, classroomId: fixture.classroomId, attemptId: fixture.attemptId, robotId: fixture.robotId }));
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) void main().catch((error) => { console.error(error instanceof Error ? error.message : "WF-03 fixture seed failed"); process.exitCode = 1; });
