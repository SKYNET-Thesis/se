import { ConflictException, NotFoundException } from '@nestjs/common';
import { EducationAdminService } from './education-admin.service';

const admin = { vistaUserId: 'admin-1', memberships: [{ organizationId: 'school-1', status: 'active', permissions: ['education.classroom.manage'] }] };

describe('EducationAdminService course offering assignment', () => {
  const findCourse = jest.fn();
  const createOffering = jest.fn();
  const service = new EducationAdminService(
    { learning_courses: { findFirst: findCourse }, learning_course_offerings: { create: createOffering } } as never,
    { isSystemAdministrator: jest.fn().mockReturnValue(false) } as never,
    {} as never, {} as never,
  );

  beforeEach(() => { findCourse.mockReset(); createOffering.mockReset(); });

  it('refuses an unpublished or school-owned course before creating an offering', async () => {
    findCourse.mockResolvedValue(null);
    await expect((service as unknown as { createCourseOffering: Function }).createCourseOffering(admin, 'school-1', { courseId: 'course-1', code: 'R-101' }))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(createOffering).not.toHaveBeenCalled();
  });

  it('creates an active organization offering only from a published global course', async () => {
    findCourse.mockResolvedValue({ id: 'course-1', status: 'published', title: 'Robotics' });
    createOffering.mockResolvedValue({ id: 'offering-1', course_id: 'course-1', status: 'active' });
    await expect((service as unknown as { createCourseOffering: Function }).createCourseOffering(admin, 'school-1', { courseId: 'course-1', code: 'R-101' }))
      .resolves.toMatchObject({ status: 'active' });
    expect(createOffering).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organization_id: 'school-1', course_id: 'course-1', status: 'active' }) }));
  });
});
