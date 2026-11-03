import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ActivityProgressService, activityIdsForLesson } from './activity-progress.service';

const learner = (id: string) => ({
  authUserId: `auth-${id}`, vistaUserId: id, email: 'learner@vista.test', status: 'active',
  systemRoleCodes: [], systemPermissions: [], memberships: [],
});
const user1 = learner('11111111-1111-4111-8111-111111111111');
const user2 = learner('22222222-2222-4222-8222-222222222222');
const courseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const lessonId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const readId = `${lessonId}-reading-1`;

describe('ActivityProgressService', () => {
  const query = jest.fn();
  const transaction = jest.fn();
  const coursePath = jest.fn();
  const service = new ActivityProgressService({ $queryRaw: query, $transaction: transaction } as never, { coursePath } as never);

  beforeEach(() => {
    query.mockReset(); transaction.mockReset(); coursePath.mockReset();
    coursePath.mockResolvedValue({ lessons: [{ id: lessonId, status: 'current' }] });
  });

  it('maps only the existing outline activity IDs for each lesson type', () => {
    expect(activityIdsForLesson(lessonId, 1)).toEqual([
      `${lessonId}-reading-1`, `${lessonId}-demonstration`, `${lessonId}-reading-2`, `${lessonId}-knowledge-check`,
    ]);
    expect(activityIdsForLesson(lessonId, 2)).toContain(`${lessonId}-simulation`);
    expect(activityIdsForLesson(lessonId, 5)).toContain(`${lessonId}-physical`);
  });

  it('returns persisted self-completion and only authoritative PASS evidence after reload', async () => {
    const completedAt = new Date('2026-11-03T10:00:00Z');
    query.mockResolvedValueOnce([{ id: lessonId, ordinal: 1 }])
      .mockResolvedValueOnce([{ activity_id: readId, completed_at: completedAt }])
      .mockResolvedValueOnce([{ lesson_id: lessonId, completed_at: completedAt }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await service.courseProgress(user1 as never, courseId);
    expect(result.activities).toEqual(expect.arrayContaining([
      { activityId: readId, status: 'completed', completedAt },
      { activityId: `${lessonId}-knowledge-check`, status: 'completed', completedAt },
      { activityId: `${lessonId}-demonstration`, status: 'not_started', completedAt: null },
    ]));
    expect(coursePath).toHaveBeenCalledWith(user1, courseId);
    expect(query.mock.calls.flatMap((call) => call.slice(1))).toContain(user1.vistaUserId);
  });

  it('does not turn Lesson PASS or failed quiz/simulation/physical evidence into activity ticks', async () => {
    coursePath.mockResolvedValue({ lessons: [{ id: lessonId, status: 'completed' }] });
    query.mockResolvedValueOnce([{ id: lessonId, ordinal: 1 }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await service.courseProgress(user1 as never, courseId);
    expect(result.activities.every((item) => item.status === 'not_started')).toBe(true);
    const evidenceSql = query.mock.calls.slice(2).map((call) => (call[0] as TemplateStringsArray).join('?')).join(' ');
    expect(evidenceSql).toContain("status='evaluated'");
    expect(evidenceSql).toContain("verdict='passed'");
    expect(evidenceSql).toContain("execution_mode='real_robot'");
    expect(evidenceSql).toContain("status='succeeded'");
  });

  it('projects only matching symbolic PASS and succeeded qualified physical evidence', async () => {
    const lesson2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const lesson5 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const completedAt = new Date('2026-11-03T11:00:00Z');
    query.mockResolvedValueOnce([{ id: lesson2, ordinal: 2 }, { id: lesson5, ordinal: 5 }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ lesson_id: lesson2, completed_at: completedAt }])
      .mockResolvedValueOnce([{ lesson_id: lesson5, completed_at: completedAt }]);
    const result = await service.courseProgress(user1 as never, courseId);
    expect(result.activities.filter((item) => item.status === 'completed')).toEqual([
      { activityId: `${lesson2}-simulation`, status: 'completed', completedAt },
      { activityId: `${lesson5}-physical`, status: 'completed', completedAt },
    ]);
    const physicalSql = (query.mock.calls[4][0] as TemplateStringsArray).join('?');
    expect(physicalSql).toContain('se.submission_id=s.id');
    expect(physicalSql).toContain("e.output_snapshot->>'state'='succeeded'");
  });

  it('rejects a course outside current enrollment before reading progress', async () => {
    coursePath.mockRejectedValue(new NotFoundException());
    await expect(service.courseProgress(user1 as never, courseId)).rejects.toBeInstanceOf(NotFoundException);
    expect(query).not.toHaveBeenCalled();
  });

  it('persists Reading completion idempotently with server time and learner identity', async () => {
    query.mockResolvedValue([{ id: lessonId, course_id: courseId, ordinal: 1 }]);
    const completedAt = new Date('2026-11-03T10:00:00Z');
    const txQuery = jest.fn().mockResolvedValue([{ activity_id: readId, completed_at: completedAt }]);
    transaction.mockImplementation(async (fn) => fn({ $queryRaw: txQuery }));
    expect(await service.completeSelfReport(user1 as never, readId)).toEqual({ activityId: readId, status: 'completed', completedAt });
    expect(await service.completeSelfReport(user1 as never, readId)).toEqual({ activityId: readId, status: 'completed', completedAt });
    const insertSql = (txQuery.mock.calls[0][0] as TemplateStringsArray).join('?');
    expect(insertSql).toContain('ON CONFLICT');
    expect(insertSql).toContain('COALESCE');
    expect(txQuery.mock.calls[0].slice(1)).toContain(user1.vistaUserId);
    expect(txQuery.mock.calls[0].slice(1)).toContain(readId);
  });

  it('isolates two learners even when they complete the same Reading activity', async () => {
    query.mockResolvedValue([{ id: lessonId, course_id: courseId, ordinal: 1 }]);
    const txQuery = jest.fn().mockResolvedValue([{ activity_id: readId, completed_at: new Date() }]);
    transaction.mockImplementation(async (fn) => fn({ $queryRaw: txQuery }));
    await service.completeSelfReport(user1 as never, readId);
    await service.completeSelfReport(user2 as never, readId);
    expect(txQuery.mock.calls[0].slice(1)).toContain(user1.vistaUserId);
    expect(txQuery.mock.calls[1].slice(1)).toContain(user2.vistaUserId);
  });

  it.each(['knowledge-check', 'simulation', 'physical', 'guided-practice', 'result'])('rejects client completion of %s', async (suffix) => {
    await expect(service.completeSelfReport(user1 as never, `${lessonId}-${suffix}`)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects locked, missing, or other-course Reading activities without writing', async () => {
    query.mockResolvedValueOnce([{ id: lessonId, course_id: courseId, ordinal: 1 }]);
    coursePath.mockResolvedValueOnce({ lessons: [{ id: lessonId, status: 'locked' }] });
    await expect(service.completeSelfReport(user1 as never, readId)).rejects.toBeInstanceOf(ConflictException);
    query.mockResolvedValueOnce([]);
    await expect(service.completeSelfReport(user1 as never, readId)).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
