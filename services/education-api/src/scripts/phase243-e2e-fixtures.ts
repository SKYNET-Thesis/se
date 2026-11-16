import { PrismaClient } from '@prisma/client';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { CurriculumService } from '../modules/learning/curriculum.service';
import { LearningScopeService } from '../modules/learning/learning-scope.service';
import { LearningService } from '../modules/learning/learning.service';
import { LearningMediaService } from '../modules/learning/learning-media.service';
import { LearningMediaStorage } from '../modules/learning/learning-media.storage';
import { ConfigService } from '@nestjs/config';
import { ProgressionService } from '../modules/learning/progression.service';
import { QuestionBankService } from '../modules/learning/question-bank.service';
import { matchesDisposableDatabaseTarget } from '../modules/learning/isolated-db-target';

const databaseUrl = process.env.VISTA_E2E_ADMIN_DATABASE_URL ?? '';
const fixtureName = 'VISTA Phase 2.4.3 isolated E2E fixture';
const courseTitle = 'VISTA Phase 2.4.3 canonical course';
const schoolId = 'f2430000-0000-4000-8000-000000000200';
const otherSchoolId = 'f2430000-0000-4000-8000-000000000201';
const identities = {
  admin: { id: 'f2430000-0000-4000-8000-000000000001', auth: 'f2430000-0000-4000-8000-000000000101', email: 'phase243-admin@vista.test', name: 'Phase 2.4.3 Test Admin' },
  schoolAdmin: { id: 'f2430000-0000-4000-8000-000000000002', auth: 'f2430000-0000-4000-8000-000000000102', email: 'phase243-school-admin@vista.test', name: 'Phase 2.4.3 Test School Admin' },
  instructor: { id: 'f2430000-0000-4000-8000-000000000003', auth: 'f2430000-0000-4000-8000-000000000103', email: 'phase243-instructor@vista.test', name: 'Phase 2.4.3 Test Instructor' },
  student: { id: 'f2430000-0000-4000-8000-000000000004', auth: 'f2430000-0000-4000-8000-000000000104', email: 'phase243-student@vista.test', name: 'Phase 2.4.3 Test Student' },
  otherSchoolAdmin: { id: 'f2430000-0000-4000-8000-000000000005', auth: 'f2430000-0000-4000-8000-000000000105', email: 'phase243-other-school-admin@vista.test', name: 'Phase 2.4.3 Other School Admin' },
  otherStudent: { id: 'f2430000-0000-4000-8000-000000000006', auth: 'f2430000-0000-4000-8000-000000000106', email: 'phase243-other-student@vista.test', name: 'Phase 2.4.3 Other Student' },
};

function assertIsolatedTarget(): void {
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new Error('VISTA_E2E_ADMIN_DATABASE_URL is required and must identify the isolated loopback PostgreSQL target.'); }
  const supabaseUrl = process.env.SUPABASE_URL;
  const localAuthOnly = !supabaseUrl || (() => {
    try { const value = new URL(supabaseUrl); return value.protocol === 'http:' && value.hostname === '127.0.0.1' && ['54321', '54323'].includes(value.port) && value.pathname === '/'; }
    catch { return false; }
  })();
  if (!matchesDisposableDatabaseTarget(databaseUrl) || !localAuthOnly) {
    throw new Error('E2E fixture writes require the exact disposable loopback target named by VISTA_TEST_DATABASE_NAME/VISTA_TEST_DATABASE_PORT and local-only auth.');
  }
}

const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const scope = new LearningScopeService(db as never);
const progression = new ProgressionService(db as never, scope as never);
const learning = new LearningService(db as never, scope as never, progression);
const media = new LearningMediaService(db as never, scope as never, new LearningMediaStorage(new ConfigService()), progression);
const curriculum = new CurriculumService(db as never, progression, media);
const questionBank = new QuestionBankService(db as never);
const adminUser = { vistaUserId: identities.admin.id, status: 'active', systemPermissions: ['org.manage'], memberships: [] };

// The verified Production baseline is schema-only. These exact capability codes
// come from the Education API guards/services, not from a synthetic bypass.
// Bootstrap is limited by assertIsolatedTarget() to the disposable local DB.
const fixtureRolePermissions: Record<string, { scope: string; permissions: string[] }> = {
  system_admin: { scope: 'system', permissions: ['org.manage'] },
  school_admin: { scope: 'organization', permissions: ['learning.delivery.manage', 'learning.course.author', 'education.classroom.read', 'education.classroom.manage', 'education.classroom.members.manage', 'education.members.read', 'education.members.provision'] },
  instructor: { scope: 'organization', permissions: ['learning.delivery.manage', 'learning.course.author', 'learning.course.publish', 'learning.work.review', 'learning.assessment.assess'] },
  student: { scope: 'organization', permissions: ['learning.work.write'] },
};

async function bootstrapFixtureRbac(): Promise<void> {
  await db.$transaction(async (tx) => {
    for (const [code, definition] of Object.entries(fixtureRolePermissions)) {
      const role = await tx.roles.upsert({ where: { code }, create: { code, name: code, scope: definition.scope }, update: {} });
      if (role.scope !== definition.scope) throw new Error(`Unexpected ${code} role scope in isolated fixture DB.`);
      for (const permissionCode of definition.permissions) {
        const permission = await tx.permissions.upsert({ where: { code: permissionCode }, create: { code: permissionCode }, update: {} });
        await tx.role_permissions.upsert({
          where: { role_id_permission_id: { role_id: role.id, permission_id: permission.id } },
          create: { role_id: role.id, permission_id: permission.id }, update: {},
        });
      }
    }
  });
}

async function seed(): Promise<Record<string, unknown>> {
  if (await db.learning_courses.findFirst({ where: { title: courseTitle, created_by: identities.admin.id } })) {
    throw new Error('Fixture already exists. Recreate the approved disposable database from its baseline; published Question Bank mappings are immutable.');
  }
  await bootstrapFixtureRbac();
  const roles = await db.roles.findMany({ where: { code: { in: ['system_admin', 'school_admin', 'instructor', 'student'] } }, select: { id: true, code: true } });
  const roleIds = Object.fromEntries(roles.map((row) => [row.code, row.id]));
  for (const role of ['system_admin', 'school_admin', 'instructor', 'student']) if (!roleIds[role]) throw new Error(`Required built-in role ${role} is missing.`);
  const users = await Promise.all(Object.values(identities).map((item) => db.users.create({ data: { id: item.id, auth_user_id: item.auth, email: item.email, full_name: item.name, signup_method: 'admin_created', status: 'active' } })));
  const org = await db.organizations.create({ data: { id: schoolId, name: fixtureName, type: 'institution', segment: 'education', status: 'active' } });
  const otherOrg = await db.organizations.create({ data: { id: otherSchoolId, name: `${fixtureName} · other school`, type: 'institution', segment: 'education', status: 'active' } });
  await db.user_system_roles.create({ data: { user_id: identities.admin.id, role_id: roleIds.system_admin } });
  const schoolMembership = await db.memberships.create({ data: { user_id: identities.schoolAdmin.id, organization_id: org.id, role_id: roleIds.school_admin, status: 'active' } });
  const instructorMembership = await db.memberships.create({ data: { user_id: identities.instructor.id, organization_id: org.id, role_id: roleIds.instructor, status: 'active' } });
  const studentMembership = await db.memberships.create({ data: { user_id: identities.student.id, organization_id: org.id, role_id: roleIds.student, status: 'active' } });
  const otherStudentMembership = await db.memberships.create({ data: { user_id: identities.otherStudent.id, organization_id: org.id, role_id: roleIds.student, status: 'active' } });
  await db.memberships.create({ data: { user_id: identities.otherSchoolAdmin.id, organization_id: otherOrg.id, role_id: roleIds.school_admin, status: 'active' } });
  const missingPermissionCodes = ['org.manage', 'learning.delivery.manage', 'learning.work.write'];
  const permissions = await db.permissions.findMany({ where: { code: { in: missingPermissionCodes } }, select: { id: true, code: true } });
  const permissionIds = Object.fromEntries(permissions.map((item) => [item.code, item.id]));
  if (missingPermissionCodes.some((code) => !permissionIds[code])) throw new Error('Required learning delivery/work permissions are missing.');
  const instructorHasDelivery = await db.role_permissions.findFirst({ where: { role_id: roleIds.instructor, permissions: { code: 'learning.delivery.manage' } } });
  const schoolHasDelivery = await db.role_permissions.findFirst({ where: { role_id: roleIds.school_admin, permissions: { code: 'learning.delivery.manage' } } });
  const studentHasWork = await db.role_permissions.findFirst({ where: { role_id: roleIds.student, permissions: { code: 'learning.work.write' } } });
  const adminCanManageOrgs = await db.role_permissions.findFirst({ where: { role_id: roleIds.system_admin, permissions: { code: 'org.manage' } } });
  if (!instructorHasDelivery || !schoolHasDelivery || !studentHasWork || !adminCanManageOrgs) throw new Error('Built-in role permissions do not satisfy the E2E authorization fixture; refusing to alter shared roles.');

  const course = await learning.createGlobalCourse(adminUser as never, { title: courseTitle, description: 'Synthetic isolated Playwright acceptance fixture.' });
  const lesson = await learning.createCourseLesson(adminUser as never, course.id, { title: 'Lesson 1 · Safe robot motion', content: { summary: 'Synthetic lesson used only by local acceptance tests.' } });
  const objective = await db.learning_objectives.create({ data: { lesson_id: lesson.id, code: 'E2E-243-OBJ', description: 'Identify the safe answer in a knowledge check.', ordinal: 1 } });
  const question = await questionBank.createQuestion(adminUser as never, { courseId: course.id, lessonId: lesson.id, code: 'E2E-243-Q1' });
  const version = await questionBank.createVersion(adminUser as never, question.id, {
    type: 'single_choice', difficulty: 'easy', cognitiveLevel: 'remember', stem: 'Which command safely stops the robot?',
    options: [{ id: 'stop', text: 'Stop motion' }, { id: 'home', text: 'Move home immediately' }], answerKey: ['stop'], explanation: 'Stop motion before changing a task.',
  });
  await questionBank.mapObjectives(adminUser as never, version.id, { objectiveIds: [objective.id] });
  await questionBank.submitReview(adminUser as never, version.id);
  await questionBank.publish(adminUser as never, version.id);
  const quiz = await questionBank.createQuizAssignment(adminUser as never, lesson.id, 'Safety knowledge check', 'Choose the safe response.', 100);
  await questionBank.addToAssignment(adminUser as never, quiz.id, { questionVersionId: version.id, ordinal: 1, points: 1 });
  const section = await curriculum.createSection(adminUser as never, lesson.id, { title: 'Read and check', ordinal: 1 });
  const reading = await curriculum.createActivity(adminUser as never, section.id, { title: 'Safety reading', type: 'reading', ordinal: 1, contentRef: { kind: 'lesson_content', key: 'e2e-reading' }, content: { version: 1, blocks: [{ type: 'heading', text: 'Safe motion' }, { type: 'paragraph', text: 'Stop before changing a robot task.' }] } });
  const video = await curriculum.createActivity(adminUser as never, section.id, { title: 'Safety video preview', type: 'video', ordinal: 2, contentRef: { kind: 'lesson_content', key: 'e2e-video' }, content: { version: 1, description: 'Video preview placeholder; media delivery is tested against the configured local S3 endpoint.' } });
  const knowledgeCheck = await curriculum.createActivity(adminUser as never, section.id, { title: 'Safety quiz', type: 'knowledge_check', ordinal: 3, contentRef: { kind: 'assignment', id: quiz.id } });
  await curriculum.setSectionStatus(adminUser as never, section.id, 'published');
  await curriculum.setActivityStatus(adminUser as never, reading.id, 'published');
  await curriculum.setActivityStatus(adminUser as never, knowledgeCheck.id, 'published');

  const offering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: org.id, code: 'E2E-243-OFFERING', title: 'Phase 2.4.3 Test Offering', status: 'active', created_by: identities.schoolAdmin.id } });
  const classroom = await db.learning_classrooms.create({ data: { organization_id: org.id, offering_id: offering.id, name: 'Phase 2.4.3 Test Classroom', code: 'E2E-243-CLASS', status: 'active', created_by: identities.schoolAdmin.id } });
  const programAssignment = await db.learning_assignments.create({ data: { lesson_id: lesson.id, title: 'Blockly review assignment', instructions: 'Submit a saved Blockly ProgramVersion for instructor review.', constraints: {}, allowed_blocks: [] } });
  const programDelivery = await db.learning_classroom_assignments.create({ data: { classroom_id: classroom.id, assignment_id: programAssignment.id, status: 'published', published_by: identities.instructor.id } });
  const rubricCriterion = await db.learning_rubric_criteria.create({ data: { assignment_id: programAssignment.id, title: 'Program evidence', max_points: 10, ordinal: 1 } });
  const otherOffering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: otherOrg.id, code: 'E2E-243-OTHER-OFFERING', title: 'Other School Offering', status: 'active', created_by: identities.otherSchoolAdmin.id } });
  const otherClassroom = await db.learning_classrooms.create({ data: { organization_id: otherOrg.id, offering_id: otherOffering.id, name: 'Other School Classroom', code: 'E2E-243-OTHER-CLASS', status: 'active', created_by: identities.otherSchoolAdmin.id } });
  await db.learning_classroom_members.createMany({ data: [
    { classroom_id: classroom.id, user_id: identities.instructor.id, membership_id: instructorMembership.id, classroom_role: 'teacher', status: 'active' },
    { classroom_id: classroom.id, user_id: identities.student.id, membership_id: studentMembership.id, classroom_role: 'student', status: 'active' },
    { classroom_id: classroom.id, user_id: identities.otherStudent.id, membership_id: otherStudentMembership.id, classroom_role: 'student', status: 'active' },
  ] });
  const enrollment = await db.learning_enrollments.create({ data: { course_id: course.id, learner_user_id: identities.student.id, classroom_id: classroom.id, offering_id: offering.id, status: 'active' } });
  await db.learning_enrollments.create({ data: { course_id: course.id, learner_user_id: identities.otherStudent.id, classroom_id: classroom.id, offering_id: offering.id, status: 'active' } });
  const fixture = {
    kind: 'vista_phase_2_4_3_e2e_fixture_v1', schoolId: org.id, organizationId: org.id, courseId: course.id, lessonId: lesson.id,
    objectiveId: objective.id, questionId: question.id, questionVersionId: version.id, canonicalQuizAssignmentId: quiz.id,
    sectionId: section.id, readingActivityId: reading.id, videoActivityId: video.id, quizActivityId: knowledgeCheck.id,
    classroomId: classroom.id, offeringId: offering.id, enrollmentId: enrollment.id,
    programAssignmentId: programAssignment.id, programDeliveryId: programDelivery.id, rubricCriterionId: rubricCriterion.id,
    otherSchoolId: otherOrg.id, otherClassroomId: otherClassroom.id,
    users: Object.fromEntries(Object.entries(identities).map(([key, value]) => [key, { userId: value.id, authUserId: value.auth, email: value.email }])),
    notes: { video: 'The preview row is intentionally draft until local S3 is available; it contains no fake ready asset.' },
  };
  return fixture;
}

async function main(): Promise<void> {
  assertIsolatedTarget();
  await db.$connect();
  try {
    const mode = process.argv[2];
    if (mode === 'clean') { throw new Error('Recreate or dispose of the approved tmpfs database; published Question Bank mappings cannot be deleted by fixture cleanup.'); }
    if (mode !== 'seed') throw new Error('Usage: phase243-e2e-fixtures.js seed|clean');
    const outputPath = process.env.VISTA_E2E_FIXTURE_FILE ?? '';
    const resolvedOutput = resolve(outputPath);
    if (!outputPath || dirname(resolvedOutput) !== '/tmp' || !basename(resolvedOutput).startsWith('vista-phase243-fixture')) {
      throw new Error('VISTA_E2E_FIXTURE_FILE must be a direct /tmp/vista-phase243-fixture*.json file.');
    }
    const handle = await open(resolvedOutput, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o600);
    try {
      const fixture = await seed();
      await handle.writeFile(`${JSON.stringify(fixture, null, 2)}\n`);
      console.log(JSON.stringify({ fixtureFile: resolvedOutput, fixture }));
    } catch (error) { throw error; }
    finally { await handle.close(); }
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
