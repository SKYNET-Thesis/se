import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { createClassroom, createDb, describeDb, type Db } from '../learning/db-test-support';
import { LearningScopeService } from '../learning/learning-scope.service';
import { EducationAdminService } from './education-admin.service';
import { SchoolAdminQueryService } from './school-admin-query.service';

/** Real PostgreSQL: one Course supports many Offerings (several schools, several per school); the list is tenant-scoped and reports the course. */
describeDb('course offerings (PostgreSQL)', () => {
  const db: Db = createDb();
  let service: EducationAdminService; let queries: SchoolAdminQueryService;
  beforeAll(async () => { await db.$connect(); const scope = new LearningScopeService(db as never); service = new EducationAdminService(db as never, scope, {} as never, {} as never, {} as never); queries = new SchoolAdminQueryService(db as never, scope); });
  afterAll(async () => { await db.$disconnect(); });
  /** A persisted administrator: created_by is a real foreign key. */
  const realUsers = new Map<string, string>();
  const manager = (organizationId: string) => ({ authUserId: 'a', vistaUserId: realUsers.get(organizationId) ?? '', email: 'm@test', status: 'active', systemRoleCodes: [], systemPermissions: [],
    memberships: [{ id: 'm', organizationId, roleCode: 'school_admin', status: 'active', permissions: ['education.classroom.manage', 'education.classroom.read'] }] }) as never;
  const school = async (suffix: string) => {
    const organization = await db.organizations.create({ data: { name: `offer ${suffix}`, type: 'institution', segment: 'education' } });
    realUsers.set(organization.id, (await db.users.create({ data: { full_name: `Admin ${suffix}`, signup_method: 'admin_created', status: 'active' } })).id);
    return organization;
  };

  it('lets two schools and one school (twice) each hold offerings of the same global course, without copying content', async () => {
    const s = randomUUID().slice(0, 8);
    const [a, b] = [await school(`a${s}`), await school(`b${s}`)];
    const course = await db.learning_courses.create({ data: { title: `Global ${s}`, status: 'published' } });
    const lessonsBefore = await db.learning_lessons.count({ where: { course_id: course.id } });
    const a1 = await service.createCourseOffering(manager(a.id), a.id, { courseId: course.id, code: 'FALL', title: 'Fall', academicTerm: 'Fall', academicYear: 2026 });
    const a2 = await service.createCourseOffering(manager(a.id), a.id, { courseId: course.id, code: 'SPRING' });
    const b1 = await service.createCourseOffering(manager(b.id), b.id, { courseId: course.id, code: 'FALL' });   // same code, other school: allowed
    expect([a1, a2, b1].map((o) => o.status)).toEqual(['draft', 'draft', 'draft']);
    expect(await db.learning_course_offerings.count({ where: { course_id: course.id } })).toBe(3);
    expect(await db.learning_lessons.count({ where: { course_id: course.id } })).toBe(lessonsBefore);            // nothing was duplicated
    expect(await db.learning_courses.count({ where: { title: { contains: `Global ${s}` } } })).toBe(1);

    const listedA = await queries.offerings(manager(a.id), a.id) as Array<{ code: string; courseId: string; academicTerm: string | null; academicYear: number | null; classrooms: number }>;
    expect(listedA.map((o) => o.code).sort()).toEqual(['FALL', 'SPRING']);                                         // only school A's, not B's
    expect(new Set(listedA.map((o) => o.courseId))).toEqual(new Set([course.id]));
    expect(listedA.find((o) => o.code === 'FALL')).toMatchObject({ academicTerm: 'Fall', academicYear: 2026, classrooms: 0 });
    const listedB = await queries.offerings(manager(b.id), b.id) as Array<{ code: string }>;
    expect(listedB.map((o) => o.code)).toEqual(['FALL']);
  });

  it('counts classrooms per offering, and keeps classroom behaviour untouched', async () => {
    const s = randomUUID().slice(0, 8); const a = await school(`c${s}`);
    const course = await db.learning_courses.create({ data: { title: `Counted ${s}`, status: 'published' } });
    const offering = await service.createCourseOffering(manager(a.id), a.id, { courseId: course.id, code: 'C1' }) as { id: string };
    await createClassroom(db, a.id, offering.id, `c1-${s}`); await createClassroom(db, a.id, offering.id, `c2-${s}`);
    const [listed] = await queries.offerings(manager(a.id), a.id) as Array<{ classrooms: number }>;
    expect(listed.classrooms).toBe(2);
  });

  it('rejects a duplicate code in the same school, an unpublished course and another school\'s course; refuses outsiders', async () => {
    const s = randomUUID().slice(0, 8); const [a, b] = [await school(`d${s}`), await school(`e${s}`)];
    const published = await db.learning_courses.create({ data: { title: `P ${s}`, status: 'published' } });
    const draft = await db.learning_courses.create({ data: { title: `D ${s}`, status: 'draft' } });
    const ownedByB = await db.learning_courses.create({ data: { title: `B ${s}`, status: 'published', organization_id: b.id } });
    const ownedByA = await db.learning_courses.create({ data: { title: `A ${s}`, status: 'published', organization_id: a.id } });
    await service.createCourseOffering(manager(a.id), a.id, { courseId: published.id, code: 'DUP' });
    await expect(service.createCourseOffering(manager(a.id), a.id, { courseId: published.id, code: 'DUP' })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.createCourseOffering(manager(a.id), a.id, { courseId: draft.id, code: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createCourseOffering(manager(a.id), a.id, { courseId: ownedByB.id, code: 'Y' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createCourseOffering(manager(a.id), a.id, { courseId: ownedByA.id, code: 'OWN' })).resolves.toMatchObject({ status: 'draft' });   // its own school's course is allowed
    await expect(service.createCourseOffering(manager(b.id), a.id, { courseId: published.id, code: 'Z' })).rejects.toBeInstanceOf(NotFoundException);       // not a manager of school A
    await expect(Promise.resolve().then(() => queries.offerings(manager(b.id), a.id))).rejects.toBeInstanceOf(NotFoundException);
  });
});
