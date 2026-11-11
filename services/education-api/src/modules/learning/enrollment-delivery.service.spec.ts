import { NotFoundException } from '@nestjs/common';
import { EnrollmentDeliveryService } from './enrollment-delivery.service';
import { COURSE_SYNC_TRANSACTION_OPTIONS } from './course-sync-transaction';

const sql = (call: unknown[]) => String((call[0] as TemplateStringsArray).join('?'));
const room = { id: 'classroom-1', organization_id: 'org-1', offering_id: 'offering-1', status: 'active' };

describe('EnrollmentDeliveryService', () => {
  const transaction = jest.fn();
  const service = new EnrollmentDeliveryService({ $transaction: transaction } as never);
  const withTx = (tx: object) => transaction.mockImplementation(async (work) => work(tx));

  beforeEach(() => transaction.mockReset());

  describe('classroom lock', () => {
    it('locks the classroom row with FOR NO KEY UPDATE and returns the freshly read row', async () => {
      const query = jest.fn().mockResolvedValueOnce([room]);
      await expect(service.lockClassroomIn({ $queryRaw: query } as never, 'classroom-1')).resolves.toEqual(room);
      expect(sql(query.mock.calls[0])).toContain('FOR NO KEY UPDATE');
    });

    it('takes the lock before reading eligibility or writing, for synchronization and release alike', async () => {
      const sync = jest.fn().mockResolvedValueOnce([room]).mockResolvedValueOnce([{ course_id: 'course-1' }]).mockResolvedValueOnce([]);
      await service.synchronizeClassroomIn({ $queryRaw: sync } as never, 'classroom-1');
      expect(sql(sync.mock.calls[0])).toContain('FOR NO KEY UPDATE');
      expect(sql(sync.mock.calls[1])).toContain("course.status='published'");

      const release = jest.fn().mockResolvedValueOnce([room]).mockResolvedValueOnce([]);
      await service.releaseIn({ $queryRaw: release } as never, 'classroom-1');
      expect(sql(release.mock.calls[0])).toContain('FOR NO KEY UPDATE');
      expect(sql(release.mock.calls[1])).toContain("SET status='revoked'");
    });
  });

  it('enrolls every active classroom student with one idempotent upsert on the (course, learner, classroom) key', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([room])
      .mockResolvedValueOnce([{ course_id: 'course-1' }])
      .mockResolvedValueOnce([{ id: 'enrollment-1', learner_user_id: 'student-1', status: 'active' }]);
    withTx({ $queryRaw: query });

    await expect(service.synchronizeClassroom('classroom-1')).resolves.toEqual([
      { id: 'enrollment-1', learner_user_id: 'student-1', status: 'active' },
    ]);

    const eligibility = sql(query.mock.calls[1]);
    expect(eligibility).toContain("course.status='published'");
    expect(eligibility).toContain("c.status='active' AND o.status='active'");
    const enrollment = sql(query.mock.calls[2]);
    expect(enrollment).toContain('ON CONFLICT (course_id, learner_user_id, classroom_id)');
    expect(enrollment).toContain("WHEN public.learning_enrollments.status='completed' THEN 'completed' ELSE 'active'");
    expect(enrollment).toContain('ON CONFLICT (learner_user_id, lesson_id) DO NOTHING');
    expect(enrollment).toContain('ORDER BY s.user_id, l.id'); // stable insert order avoids cross-classroom deadlocks on shared progress rows
    expect(enrollment).toContain("m.status='active' AND m.organization_id=c.organization_id");
    expect(enrollment).toContain("cm.classroom_role='student' AND cm.status='active'");
  });

  it('refuses to enroll when the classroom, offering or course is not deliverable', async () => {
    withTx({ $queryRaw: jest.fn().mockResolvedValueOnce([room]).mockResolvedValueOnce([]) });
    await expect(service.synchronizeClassroom('classroom-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to enroll into a classroom that no longer exists', async () => {
    withTx({ $queryRaw: jest.fn().mockResolvedValueOnce([]) });
    await expect(service.synchronizeClassroom('classroom-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not fail a membership change when the classroom course is not deliverable yet', async () => {
    const query = jest.fn().mockResolvedValueOnce([room]).mockResolvedValueOnce([]);
    withTx({ $queryRaw: query });
    await expect(service.synchronizeIfDeliverable('classroom-1')).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('still propagates unexpected synchronization failures', async () => {
    transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(service.synchronizeIfDeliverable('classroom-1')).rejects.toThrow('database unavailable');
  });

  describe('course synchronization', () => {
    it('visits only active classrooms of an active offering in ascending id order inside one transaction', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([{ id: 'room-1' }, { id: 'room-2' }])
        .mockResolvedValueOnce([room]).mockResolvedValueOnce([{ course_id: 'course-1' }]).mockResolvedValueOnce([{ id: 'e1', learner_user_id: 's1', status: 'active' }])
        .mockResolvedValueOnce([room]).mockResolvedValueOnce([]);
      withTx({ $queryRaw: query });
      await expect(service.synchronizeCourse('course-1')).resolves.toEqual({ classrooms: 2, enrolled: 1 });
      const selection = sql(query.mock.calls[0]);
      expect(selection).toContain("o.status='active' AND c.status='active'");
      expect(selection).toContain('ORDER BY c.id');
      expect(selection).toContain('FOR NO KEY UPDATE OF c'); // every classroom is locked, in id order, before any write
      expect(transaction).toHaveBeenCalledTimes(1);
      // the retry endpoint uses the same explicit limits as publishing, not Prisma's 5 s default
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), COURSE_SYNC_TRANSACTION_OPTIONS);
    });

    it('enrolls nobody when no classroom has an active offering for the course', async () => {
      withTx({ $queryRaw: jest.fn().mockResolvedValueOnce([]) });
      await expect(service.synchronizeCourse('course-1')).resolves.toEqual({ classrooms: 0, enrolled: 0 });
    });

    it('is all-or-nothing: a failure on a later classroom rejects the whole synchronization', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce([{ id: 'room-1' }, { id: 'room-2' }, { id: 'room-3' }])
        .mockResolvedValueOnce([room]).mockResolvedValueOnce([{ course_id: 'course-1' }]).mockResolvedValueOnce([{ id: 'e1', learner_user_id: 's1', status: 'active' }])
        .mockResolvedValueOnce([room]).mockResolvedValueOnce([{ course_id: 'course-1' }]).mockRejectedValueOnce(new Error('deadlock detected'));
      withTx({ $queryRaw: query });
      await expect(service.synchronizeCourse('course-1')).rejects.toThrow('deadlock detected');
      // room-3 is never attempted: nothing is reported as synchronized and the caller's transaction is rolled back
      expect(query).toHaveBeenCalledTimes(7);
    });
  });

  describe('releasing access', () => {
    it('revokes only the named student in the named classroom and never touches learning history', async () => {
      const query = jest.fn().mockResolvedValueOnce([room]).mockResolvedValueOnce([{ id: 'e1', status: 'revoked' }]);
      withTx({ $queryRaw: query });
      await expect(service.revokeClassroomEnrollment('classroom-1', 'student-1')).resolves.toEqual([{ id: 'e1', status: 'revoked' }]);
      const statement = sql(query.mock.calls[1]);
      expect(statement).toContain("SET status='revoked'");
      expect(statement).toContain('classroom_id=');
      expect(statement).toContain('learner_user_id=');
      expect(statement).toContain("status='active'");
      expect(statement).not.toMatch(/DELETE|learning_lesson_progress|learning_assignment_attempts/);
    });

    it('revokes every active enrollment of the classroom when no student is named (archive / offering change)', async () => {
      const query = jest.fn().mockResolvedValueOnce([room]).mockResolvedValueOnce([{ id: 'e1', status: 'revoked' }, { id: 'e2', status: 'revoked' }]);
      withTx({ $queryRaw: query });
      const result = await service.revokeClassroomEnrollment('classroom-1', undefined as never);
      expect(result).toHaveLength(2);
      expect(sql(query.mock.calls[1])).not.toContain('learner_user_id=');
    });
  });
});
