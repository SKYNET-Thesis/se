import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';

/**
 * Shared fixtures for the PostgreSQL integration suites. The suites only run against the dedicated disposable
 * loopback database (see course-builder-database-testing.md); anything else throws before a connection is made.
 */
const requested = process.env.RUN_POSTGRES_INTEGRATION === '1';
export const configuredUrl = process.env.VISTA_INTEGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const parsedUrl = configuredUrl ? new URL(configuredUrl) : undefined;
const isolatedIdentity = Boolean(
  parsedUrl &&
  ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname) &&
  parsedUrl.port === '55432' &&
  parsedUrl.pathname === '/vista_test_course_builder' &&
  parsedUrl.username === 'vista_test' &&
  process.env.VISTA_DATABASE_PROJECT_REF === 'vista-course-builder-test' &&
  !process.env.SUPABASE_URL,
);
if (requested && !isolatedIdentity) {
  throw new Error('PostgreSQL integration tests require the dedicated vista_test_course_builder target on loopback port 55432.');
}
export const describeDb = requested && isolatedIdentity ? describe : describe.skip;
export const createDb = () => new PrismaClient({ datasources: { db: { url: configuredUrl } } });
export type Db = ReturnType<typeof createDb>;

/** A persisted system administrator (rows such as questions reference users through created_by). */
export async function createSystemAdmin(db: Db, permissions: string[] = ['org.manage']): Promise<AuthenticatedUser> {
  const user = await db.users.create({ data: { full_name: 'Admin', signup_method: 'admin_created', status: 'active' } });
  return { authUserId: 'a', vistaUserId: user.id, email: 'admin@test', status: 'active', systemRoleCodes: ['system_admin'], systemPermissions: permissions, memberships: [] } as unknown as AuthenticatedUser;
}

export const schoolAdminUser = (organizationId: string): AuthenticatedUser => ({
  authUserId: 'a', vistaUserId: randomUUID(), email: 'a@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id: 'm', organizationId, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.manage', 'education.classroom.members.manage'] }],
}) as unknown as AuthenticatedUser;

/** A school with a student role, one global published course (lesson 1 with a published section/activity) and one offering. */
export async function createWorld(db: Db, options: { courseStatus?: string; offeringStatus?: string; deliverable?: boolean } = {}) {
  const suffix = randomUUID().slice(0, 8);
  const org = await db.organizations.create({ data: { name: `it ${suffix}`, type: 'institution', segment: 'education' } });
  const role = await db.roles.create({ data: { code: `student-${suffix}`, name: 'Student', scope: 'organization' } });
  const course = await db.learning_courses.create({ data: { title: `Course ${suffix}`, status: options.courseStatus ?? 'published' } });
  const lesson = await db.learning_lessons.create({ data: { course_id: course.id, title: 'L1', ordinal: 1 } });
  if (options.deliverable !== false) {
    const section = await db.learning_sections.create({ data: { lesson_id: lesson.id, title: 'S1', ordinal: 1, status: 'published' } });
    await db.learning_activities.create({ data: { section_id: section.id, title: 'A1', type: 'reading', ordinal: 1, status: 'published', content_ref: { kind: 'lesson_content', key: 'summary' }, content: { version: 1, blocks: [{ type: 'paragraph', text: 'x' }], mediaIds: [] } } });
  }
  const offering = await db.learning_course_offerings.create({ data: { course_id: course.id, organization_id: org.id, code: `o-${suffix}`, status: options.offeringStatus ?? 'active' } });
  const room = await createClassroom(db, org.id, offering.id, `a-${suffix}`);
  return { suffix, org, role, course, lesson, offering, room };
}
export type World = Awaited<ReturnType<typeof createWorld>>;

export const createClassroom = (db: Db, organizationId: string, offeringId: string, code: string) =>
  db.learning_classrooms.create({ data: { organization_id: organizationId, offering_id: offeringId, name: code, code } });

export async function createStudent(db: Db, x: Pick<World, 'org' | 'role'>) {
  const user = await db.users.create({ data: { full_name: 'Learner', signup_method: 'admin_created', status: 'active' } });
  const membership = await db.memberships.create({ data: { user_id: user.id, organization_id: x.org.id, role_id: x.role.id, status: 'active' } });
  return { user, membership };
}
export type Student = Awaited<ReturnType<typeof createStudent>>;

export const joinClassroom = (db: Db, s: Student, classroomId: string) =>
  db.learning_classroom_members.upsert({
    where: { classroom_id_user_id: { classroom_id: classroomId, user_id: s.user.id } },
    create: { classroom_id: classroomId, user_id: s.user.id, membership_id: s.membership.id, classroom_role: 'student', status: 'active' },
    update: { status: 'active', left_at: null },
  });

export const enrollmentRows = (db: Db, courseId: string, userId: string) =>
  db.learning_enrollments.findMany({ where: { course_id: courseId, learner_user_id: userId }, orderBy: [{ classroom_id: 'asc' }] });

/** Resolves when `promise` has not settled within `ms` (i.e. it is blocked), rejects semantics are preserved. */
export async function isPending(promise: Promise<unknown>, ms = 400): Promise<boolean> {
  const marker = Symbol('pending');
  const result = await Promise.race([promise.then(() => 'settled', () => 'settled'), new Promise((resolve) => setTimeout(() => resolve(marker), ms))]);
  return result === marker;
}
export const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((r) => { resolve = r; }); return { promise, resolve }; };
