import { NotFoundException } from '@nestjs/common';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';

const sql = (call: unknown[]) => String((call[0] as TemplateStringsArray).join('?'));

describe('EnrollmentDeliveryService', () => {
  const transaction = jest.fn();
  const rootQuery = jest.fn();
  const service = new EnrollmentDeliveryService({ $transaction: transaction, $queryRaw: rootQuery } as never);
  const withTx = (tx: object) => transaction.mockImplementation(async (work) => work(tx));

  beforeEach(() => { transaction.mockReset(); rootQuery.mockReset(); });

  it('enrolls every active classroom student with one idempotent upsert on the (course, learner, classroom) key', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ course_id: 'course-1' }])
      .mockResolvedValueOnce([{ id: 'enrollment-1', learner_user_id: 'student-1', status: 'active' }]);
    withTx({ $queryRaw: query });

    await expect(service.synchronizeClassroom('classroom-1')).resolves.toEqual([
      { id: 'enrollment-1', learner_user_id: 'student-1', status: 'active' },
    ]);

    const eligibility = sql(query.mock.calls[0]);
    expect(eligibility).toContain("course.status='published'");
    expect(eligibility).toContain("c.status='active' AND o.status='active'");
    const enrollment = sql(query.mock.calls[1]);
    expect(enrollment).toContain('ON CONFLICT (course_id, learner_user_id, classroom_id)');
    expect(enrollment).toContain("WHEN public.learning_enrollments.status='completed' THEN 'completed' ELSE 'active'");
    expect(enrollment).toContain('ON CONFLICT (learner_user_id, lesson_id) DO NOTHING');
    expect(enrollment).toContain("m.status='active' AND m.organization_id=c.organization_id");
  });

  it('refuses to enroll when the classroom, offering or course is not deliverable', async () => {
    withTx({ $queryRaw: jest.fn().mockResolvedValueOnce([]) });
    await expect(service.synchronizeClassroom('classroom-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not fail a membership change when the classroom course is not deliverable yet', async () => {
    const query = jest.fn().mockResolvedValueOnce([]);
    withTx({ $queryRaw: query });
    await expect(service.synchronizeIfDeliverable('classroom-1')).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('still propagates unexpected synchronization failures', async () => {
    transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(service.synchronizeIfDeliverable('classroom-1')).rejects.toThrow('database unavailable');
  });

  it('synchronizes only active classrooms of an active offering after publication', async () => {
    rootQuery.mockResolvedValueOnce([{ id: 'room-1' }, { id: 'room-2' }]);
    const query = jest.fn()
      .mockResolvedValueOnce([{ course_id: 'course-1' }]).mockResolvedValueOnce([{ id: 'e1', learner_user_id: 's1', status: 'active' }])
      .mockResolvedValueOnce([]);
    withTx({ $queryRaw: query });
    await expect(service.synchronizeCourse('course-1')).resolves.toEqual({ classrooms: 2, enrolled: 1 });
    const selection = sql(rootQuery.mock.calls[0]);
    expect(selection).toContain("o.status='active' AND c.status='active'");
  });

  it('does not enroll anyone when no classroom has an active offering for the course', async () => {
    rootQuery.mockResolvedValueOnce([]);
    await expect(service.synchronizeCourse('course-1')).resolves.toEqual({ classrooms: 0, enrolled: 0 });
    expect(transaction).not.toHaveBeenCalled();
  });

  describe('releasing access', () => {
    it('revokes only the named student in the named classroom and never touches learning history', async () => {
      const query = jest.fn().mockResolvedValue([{ id: 'e1', status: 'revoked' }]);
      withTx({ $queryRaw: query });
      await expect(service.revokeClassroomEnrollment('classroom-1', 'student-1')).resolves.toEqual([{ id: 'e1', status: 'revoked' }]);
      const statement = sql(query.mock.calls[0]);
      expect(statement).toContain("SET status='revoked'");
      expect(statement).toContain('classroom_id=');
      expect(statement).toContain('learner_user_id=');
      expect(statement).toContain("status='active'");
      expect(statement).not.toMatch(/DELETE|learning_lesson_progress|learning_assignment_attempts/);
    });

    it('revokes every active enrollment of the classroom when no student is named (archive / offering change)', async () => {
      const query = jest.fn().mockResolvedValue([{ id: 'e1', status: 'revoked' }, { id: 'e2', status: 'revoked' }]);
      withTx({ $queryRaw: query });
      const result = await service.revokeClassroomEnrollment('classroom-1', undefined as never);
      expect(result).toHaveLength(2);
      expect(sql(query.mock.calls[0])).not.toContain('learner_user_id=');
    });
  });
});
