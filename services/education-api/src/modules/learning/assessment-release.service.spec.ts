import { ConflictException, NotFoundException } from '@nestjs/common';
import { AssessmentService } from './assessment.service';

const ATTEMPT = 'attempt-1';
const user = { vistaUserId: 'student-1', status: 'active', memberships: [], systemPermissions: [] } as never;
const teacher = { vistaUserId: 'teacher-1', status: 'active', memberships: [], systemPermissions: [] } as never;

function build() {
  const queryRaw = jest.fn();
  const txQuery = jest.fn();
  const prisma = { $queryRaw: queryRaw, $transaction: jest.fn(async (work: (t: { $queryRaw: jest.Mock }) => unknown) => work({ $queryRaw: txQuery })) };
  const scope = { assertStudentClassroomAccess: jest.fn(), assertTeacherClassroomPermission: jest.fn() };
  return { service: new AssessmentService(prisma as never, scope as never), queryRaw, txQuery, scope };
}
const submissionScope = (over: Record<string, unknown> = {}) => ({ id: 'sub-1', attempt_id: ATTEMPT, assignment_id: 'as', learner_user_id: 'student-1', program_id: 'p', program_version_id: 'v', classroom_id: 'class-1', ...over });

describe('student visibility of instructor grading (attempt-level release)', () => {
  it('myGrading reveals nothing but {released:false} before release', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([{ id: ATTEMPT, classroom_id: 'class-1', grading_released_at: null, score: null }]);
    await expect(t.service.myGrading(user, ATTEMPT)).resolves.toEqual({ attemptId: ATTEMPT, released: false });
    expect(t.queryRaw).toHaveBeenCalledTimes(1); // no assessment / feedback query is even issued
  });
  it('myGrading returns the rubric scores and feedback of THIS attempt after release', async () => {
    const t = build();
    t.queryRaw
      .mockResolvedValueOnce([{ id: ATTEMPT, classroom_id: 'class-1', grading_released_at: new Date('2026-11-12'), score: null }])
      .mockResolvedValueOnce([{ overallFeedback: 'good', reviewedAt: new Date(), scores: [{ criterionId: 'c1', title: 'Safety', maxPoints: 5, awardedPoints: 4, comment: null }] }])
      .mockResolvedValueOnce([{ id: 'f1', feedbackType: 'comment', content: 'nice', createdAt: new Date() }]);
    const result = await t.service.myGrading(user, ATTEMPT) as unknown as { released: boolean; assessment: { overallFeedback: string }; feedback: unknown[] };
    expect(result.released).toBe(true);
    expect(result.assessment.overallFeedback).toBe('good');
    expect(result.feedback).toHaveLength(1);
    expect(t.scope.assertStudentClassroomAccess).toHaveBeenCalledWith(user, 'class-1'); // history read: membership only
  });
  it('myGrading hides another learner\'s attempt as not found', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([]);
    await expect(t.service.myGrading(user, ATTEMPT)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('the older feedback route returns [] until release and never queries feedback rows', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([submissionScope()]).mockResolvedValueOnce([{ released: false }]);
    await expect(t.service.myFeedback(user, 'sub-1')).resolves.toEqual([]);
    expect(t.queryRaw).toHaveBeenCalledTimes(2);
  });
  it('the older feedback route returns the feedback after release', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([submissionScope()]).mockResolvedValueOnce([{ released: true }]).mockResolvedValueOnce([{ id: 'f1' }]);
    await expect(t.service.myFeedback(user, 'sub-1')).resolves.toEqual([{ id: 'f1' }]);
  });
  it('the older feedback route hides another learner\'s submission', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([submissionScope({ learner_user_id: 'someone-else' })]);
    await expect(t.service.myFeedback(user, 'sub-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('instructor release', () => {
  const attemptRow = (over: Record<string, unknown> = {}) => ({ id: ATTEMPT, status: 'submitted', grading_released_at: null, graded: true, ...over });
  it('requires the review and assess permissions on the attempt\'s classroom', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([{ classroom_id: 'class-1' }]);
    t.txQuery.mockResolvedValueOnce([attemptRow()]).mockResolvedValueOnce([{ grading_released_at: new Date() }]);
    await t.service.releaseAttempt(teacher, ATTEMPT);
    expect(t.scope.assertTeacherClassroomPermission).toHaveBeenCalledWith(teacher, 'class-1', ['learning.work.review', 'learning.assessment.assess']);
  });
  it('does not release when the permission check fails', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([{ classroom_id: 'class-1' }]);
    t.scope.assertTeacherClassroomPermission.mockRejectedValueOnce(new NotFoundException('Classroom was not found.'));
    await expect(t.service.releaseAttempt(teacher, ATTEMPT)).rejects.toBeInstanceOf(NotFoundException);
    expect(t.txQuery).not.toHaveBeenCalled();
  });
  it('releases a graded submitted attempt and is idempotent', async () => {
    const t = build();
    t.queryRaw.mockResolvedValue([{ classroom_id: 'class-1' }]);
    const releasedAt = new Date('2026-11-12');
    t.txQuery.mockResolvedValueOnce([attemptRow()]).mockResolvedValueOnce([{ grading_released_at: releasedAt }]);
    await expect(t.service.releaseAttempt(teacher, ATTEMPT)).resolves.toEqual({ attemptId: ATTEMPT, released: true, releasedAt });
    t.txQuery.mockResolvedValueOnce([attemptRow({ grading_released_at: releasedAt })]);
    await expect(t.service.releaseAttempt(teacher, ATTEMPT)).resolves.toEqual({ attemptId: ATTEMPT, released: true, releasedAt });
    expect(t.txQuery).toHaveBeenCalledTimes(3); // the second call performed no UPDATE
  });
  it.each([['in_progress', 'ATTEMPT_NOT_SUBMITTED', true], ['submitted', 'NOTHING_TO_RELEASE', false]])('refuses a %s attempt (%s)', async (status, code, graded) => {
    const t = build();
    t.queryRaw.mockResolvedValue([{ classroom_id: 'class-1' }]);
    t.txQuery.mockResolvedValueOnce([attemptRow({ status, graded })]);
    await expect(t.service.releaseAttempt(teacher, ATTEMPT)).rejects.toMatchObject({ response: { code } });
    await expect(t.service.releaseAttempt(teacher, ATTEMPT)).rejects.toBeInstanceOf(Error);
  });
  it('releases through a submission id by resolving ITS attempt', async () => {
    const t = build();
    t.queryRaw.mockResolvedValueOnce([submissionScope({ attempt_id: 'attempt-2' })]);
    t.txQuery.mockResolvedValueOnce([attemptRow({ id: 'attempt-2' })]).mockResolvedValueOnce([{ grading_released_at: new Date() }]);
    await expect(t.service.releaseSubmission(teacher, 'sub-1')).resolves.toMatchObject({ attemptId: 'attempt-2', released: true });
  });
});

it('ConflictException is what release preconditions raise', () => {
  expect(new ConflictException({ code: 'X' }).getStatus()).toBe(409);
});
