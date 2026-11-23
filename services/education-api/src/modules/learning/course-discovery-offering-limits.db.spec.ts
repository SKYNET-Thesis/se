import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { CourseDiscoveryService } from './course-discovery.service';
import { createClassroom, createDb, createWorld, describeDb, type Db, type World } from './db-test-support';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';

/**
 * Offering rules on student SELF-enrollment, against real PostgreSQL: the enrollment window, the student cap across every classroom of the
 * offering, concurrency, and the unchanged behaviour of classroom capacity, closed classrooms and administrative enrollment.
 */
describeDb('Offering enrollment window and student cap (PostgreSQL)', () => {
  const db: Db = createDb();
  const enrollments = new EnrollmentDeliveryService(db as never);
  const service = new CourseDiscoveryService(db as never, enrollments);
  let studentRoleId = '';
  beforeAll(async () => { await db.$connect(); studentRoleId = (await db.roles.upsert({ where: { code: 'student' }, update: {}, create: { code: 'student', name: 'Student', scope: 'organization' } })).id; });
  afterAll(async () => { await db.$disconnect(); });

  const asUser = (userId: string): AuthenticatedUser => ({ authUserId: 'a', vistaUserId: userId, email: 's@test', status: 'active', systemRoleCodes: [], systemPermissions: [], memberships: [] }) as never;
  const student = async (world: World) => {
    const user = await db.users.create({ data: { full_name: 'Learner', signup_method: 'admin_created', status: 'active' } });
    await db.memberships.create({ data: { user_id: user.id, organization_id: world.org.id, role_id: studentRoleId, status: 'active' } });
    return user.id;
  };
  const open = (classroomId: string, capacity?: number) => db.learning_classrooms.update({ where: { id: classroomId }, data: { self_enrollment_open: true, capacity: capacity ?? null } });
  const offering = (world: World, data: Record<string, unknown>) => db.learning_course_offerings.update({ where: { id: world.offering.id }, data: data as never });
  const students = (offeringId: string) => db.$queryRaw<Array<{ n: number }>>`SELECT count(DISTINCT m.user_id)::int AS n FROM public.learning_classroom_members m JOIN public.learning_classrooms c ON c.id=m.classroom_id WHERE c.offering_id=${offeringId}::uuid AND m.classroom_role='student' AND m.status='active'`.then((r) => r[0].n);
  const enrolled = (courseId: string) => db.learning_enrollments.count({ where: { course_id: courseId, status: 'active' } });
  const refused = async (promise: Promise<unknown>) => { const error = await promise.then(() => null, (e: unknown) => e); expect(error).toBeInstanceOf(ConflictException); return (error as ConflictException).getResponse() as { code: string; message: string; reasonCodes: string[] }; };
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000);

  it('refuses before the window opens and after it closes, with a code and a readable message, and creates nothing', async () => {
    const world = await createWorld(db); await open(world.room.id); const learner = await student(world);
    await offering(world, { enrollment_open_at: hours(2), enrollment_close_at: hours(48) });
    const early = await refused(service.enroll(asUser(learner), world.room.id));
    expect(early).toMatchObject({ code: 'ENROLLMENT_NOT_ELIGIBLE', reasonCodes: ['ENROLLMENT_NOT_OPEN'] });
    expect(early.message).toMatch(/^Enrollment for this course opens on \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC\.$/);
    expect((await service.catalog(asUser(learner), {})).items.find((i) => i.classroomId === world.room.id)).toMatchObject({ eligible: false, reasonCodes: ['ENROLLMENT_NOT_OPEN'] });

    await offering(world, { enrollment_open_at: hours(-48), enrollment_close_at: hours(-1) });
    const late = await refused(service.enroll(asUser(learner), world.room.id));
    expect(late.reasonCodes).toEqual(['ENROLLMENT_CLOSED']);
    expect(late.message).toMatch(/^Enrollment for this course closed on /);
    expect(await students(world.offering.id)).toBe(0); expect(await enrolled(world.course.id)).toBe(0);
  });

  it('enrolls inside the window and when no window or cap is set (existing behaviour)', async () => {
    const world = await createWorld(db); await open(world.room.id);
    const [a, b] = [await student(world), await student(world)];
    await expect(service.enroll(asUser(a), world.room.id)).resolves.toMatchObject({ status: 'enrolled' });          // no window, no cap
    await offering(world, { enrollment_open_at: hours(-1), enrollment_close_at: hours(1), max_students: 5 });
    await expect(service.enroll(asUser(b), world.room.id)).resolves.toMatchObject({ status: 'enrolled' });          // inside the window, below the cap
    expect(await enrolled(world.course.id)).toBe(2);
  });

  it('stops at the cap, counts students across every classroom of the offering, and reports places left', async () => {
    const world = await createWorld(db); const second = await createClassroom(db, world.org.id, world.offering.id, `b-${world.suffix}`);
    await open(world.room.id); await open(second.id); await offering(world, { max_students: 2 });
    const [a, b, c] = [await student(world), await student(world), await student(world)];
    await service.enroll(asUser(a), world.room.id);
    expect((await service.catalog(asUser(b), {})).items.find((i) => i.classroomId === second.id)).toMatchObject({ offeringSeatsLeft: 1, eligible: true });
    await service.enroll(asUser(b), second.id);                                                                      // the second classroom takes the second place
    const full = await refused(service.enroll(asUser(c), world.room.id));                                            // the first classroom has no cap of its own
    expect(full.reasonCodes).toEqual(['OFFERING_FULL']); expect(full.message).toBe('This course is full (2 of 2 places taken).');
    await refused(service.enroll(asUser(c), second.id));
    expect(await students(world.offering.id)).toBe(2);
  });

  it('keeps the classroom capacity, closed classrooms and the one-enrollment-per-course rule exactly as before', async () => {
    const world = await createWorld(db); const [a, b] = [await student(world), await student(world)];
    await expect(service.enroll(asUser(a), world.room.id)).rejects.toBeInstanceOf(NotFoundException);               // not opened for self-enrollment
    await open(world.room.id, 1);
    await service.enroll(asUser(a), world.room.id);
    expect((await refused(service.enroll(asUser(b), world.room.id))).reasonCodes).toEqual(['CLASSROOM_FULL']);
    await expect(service.enroll(asUser(a), world.room.id)).rejects.toBeInstanceOf(NotFoundException);               // already a member: not offered again
  });

  it('does not bind authorized administrative enrollment: a School Admin can place students beyond the cap, and they get their enrollment', async () => {
    const world = await createWorld(db); await open(world.room.id); await offering(world, { max_students: 1 });
    const [a, b] = [await student(world), await student(world)];
    await service.enroll(asUser(a), world.room.id);
    await refused(service.enroll(asUser(b), world.room.id));                                                         // self-enrollment: full
    const membership = await db.memberships.findFirstOrThrow({ where: { user_id: b, organization_id: world.org.id } });
    await db.learning_classroom_members.create({ data: { classroom_id: world.room.id, user_id: b, membership_id: membership.id, classroom_role: 'student', status: 'active' } });
    await enrollments.synchronizeClassroom(world.room.id);                                                           // the administrative path (add member / import)
    expect(await enrolled(world.course.id)).toBe(2);
    expect(await students(world.offering.id)).toBe(2);
  });

  it('never exceeds the cap under concurrent self-enrollment across two classrooms (10 students, 3 places)', async () => {
    const world = await createWorld(db); const second = await createClassroom(db, world.org.id, world.offering.id, `c-${world.suffix}`);
    await open(world.room.id); await open(second.id); await offering(world, { max_students: 3 });
    const learners = await Promise.all(Array.from({ length: 10 }, () => student(world)));
    const results = await Promise.allSettled(learners.map((id, i) => service.enroll(asUser(id), i % 2 === 0 ? world.room.id : second.id)));
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(3);
    expect(rejected).toHaveLength(7);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(ConflictException);                                   // refused cleanly, never a deadlock or a 500
    expect(await students(world.offering.id)).toBe(3);
    expect(await enrolled(world.course.id)).toBe(3);
  });

  it('does not limit an uncapped offering under the same concurrency (control)', async () => {
    const world = await createWorld(db); await open(world.room.id);
    const learners = await Promise.all(Array.from({ length: 8 }, () => student(world)));
    const results = await Promise.allSettled(learners.map((id) => service.enroll(asUser(id), world.room.id)));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await students(world.offering.id)).toBe(8);
  });

  it('refuses a student who is not a student of the school or whose school is another tenant, as if the course did not exist', async () => {
    const world = await createWorld(db); await open(world.room.id);
    const other = await createWorld(db);
    const outsider = await student(other);                                                                           // an active student, but of another school
    await expect(service.enroll(asUser(outsider), world.room.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.enroll(asUser(randomUUID()), world.room.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await students(world.offering.id)).toBe(0);
  });
});
