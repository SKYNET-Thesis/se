import { ConflictException, NotFoundException } from '@nestjs/common';
import { EducationAdminService } from './education-admin.service';

const admin = { vistaUserId: 'admin-1', memberships: [{ organizationId: 'school-1', status: 'active', permissions: ['education.classroom.manage'] }] };

describe('EducationAdminService course offering assignment', () => {
  const findCourse = jest.fn();
  const createOffering = jest.fn();
  const updateOffering = jest.fn();
  const findOffering = jest.fn();
  const transaction = jest.fn();
  const synchronizeCourseIn = jest.fn();
  const service = new EducationAdminService(
    { $transaction: transaction, learning_courses: { findFirst: findCourse }, learning_course_offerings: { create: createOffering, findFirst: findOffering, update: updateOffering } } as never,
    { isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
    {} as never, {} as never, {} as never,
  );

  beforeEach(() => { findCourse.mockReset(); createOffering.mockReset(); updateOffering.mockReset(); findOffering.mockReset(); transaction.mockReset(); synchronizeCourseIn.mockReset(); });

  it('refuses an unpublished or school-owned course before creating an offering', async () => {
    findCourse.mockResolvedValue(null);
    await expect((service as unknown as { createCourseOffering: Function }).createCourseOffering(admin, 'school-1', { courseId: 'course-1', code: 'R-101' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(createOffering).not.toHaveBeenCalled();
  });

  it('creates an active organization offering only from a published global course', async () => {
    findCourse.mockResolvedValue({ id: 'course-1', status: 'published', title: 'Robotics' });
    createOffering.mockResolvedValue({ id: 'offering-1', course_id: 'course-1', status: 'draft' });
    await expect((service as unknown as { createCourseOffering: Function }).createCourseOffering(admin, 'school-1', { courseId: 'course-1', code: 'R-101' }))
      .resolves.toMatchObject({ status: 'draft' });
    expect(createOffering).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: 'school-1', course_id: 'course-1', status: 'draft' }) }));
  });

  it('updates only draft offerings in the same organization', async () => {
    findOffering.mockResolvedValue({ id: 'offering-1', status: 'draft' });
    updateOffering.mockResolvedValue({ id: 'offering-1', code: 'R-102', status: 'draft' });
    await expect((service as unknown as { updateCourseOffering: Function }).updateCourseOffering(admin, 'school-1', 'offering-1', { code: ' R-102 ' }))
      .resolves.toMatchObject({ code: 'R-102' });
    expect(updateOffering).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'offering-1' }, data: expect.objectContaining({ code: 'R-102' }) }));

    findOffering.mockResolvedValueOnce({ id: 'offering-1', status: 'active' });
    await expect((service as unknown as { updateCourseOffering: Function }).updateCourseOffering(admin, 'school-1', 'offering-1', { title: 'Nope' }))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('activates a same-organization draft and synchronizes course enrollments', async () => {
    const txOffering = { id: 'offering-1', course_id: 'course-1', status: 'draft' };
    const tx = { learning_course_offerings: { findFirst: findOffering, update: updateOffering } };
    transaction.mockImplementation(async (work: (client: unknown) => unknown) => work(tx));
    findOffering.mockResolvedValue(txOffering);
    updateOffering.mockResolvedValue({ ...txOffering, status: 'active' });
    synchronizeCourseIn.mockResolvedValue({ classrooms: 1, enrolled: 2 });
    const activationService = new EducationAdminService(
      { $transaction: transaction } as never,
      { isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
      {} as never, {} as never, { synchronizeCourseIn } as never,
    );

    await expect((activationService as unknown as { activateCourseOffering: Function }).activateCourseOffering(admin, 'school-1', 'offering-1'))
      .resolves.toMatchObject({ status: 'active', enrollmentSync: { classrooms: 1, enrolled: 2 } });
    expect(updateOffering).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'active', updated_at: expect.any(Date) } }));
    expect(synchronizeCourseIn).toHaveBeenCalledWith(tx, 'course-1');
  });
});
