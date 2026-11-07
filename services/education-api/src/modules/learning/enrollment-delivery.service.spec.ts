import { EnrollmentDeliveryService } from './enrollment-delivery.service';

describe('EnrollmentDeliveryService', () => {
  const transaction = jest.fn();
  const service = new EnrollmentDeliveryService({ $transaction: transaction } as never);

  beforeEach(() => transaction.mockReset());

  it('enrolls every active classroom student with one transactional idempotent upsert', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ course_id: 'course-1' }])
      .mockResolvedValueOnce([{ id: 'enrollment-1', learner_user_id: 'student-1', status: 'active' }]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: query }));

    await expect(service.synchronizeClassroom('classroom-1')).resolves.toEqual([
      { id: 'enrollment-1', learner_user_id: 'student-1', status: 'active' },
    ]);

    expect(transaction).toHaveBeenCalledTimes(1);
    const enrollmentSql = String(query.mock.calls[1][0]);
    expect(enrollmentSql).toContain('ON CONFLICT (course_id, learner_user_id, classroom_id)');
    expect(enrollmentSql).toContain("status='active'");
  });

  it('soft-revokes only the departing student enrollment for that classroom', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'enrollment-1', status: 'revoked' }]);
    transaction.mockImplementation(async (work) => work({ $queryRaw: query }));

    await expect(service.revokeClassroomEnrollment('classroom-1', 'student-1')).resolves.toEqual({
      id: 'enrollment-1', status: 'revoked',
    });

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain("SET status='revoked'");
    expect(sql).toContain('classroom_id');
    expect(sql).toContain('learner_user_id');
  });
});
