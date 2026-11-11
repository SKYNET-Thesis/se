import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LearningService } from './learning.service';
import { ProgressionService } from './progression.service';
import { issueQuestionBankQuiz, IssuedQuestionRow } from './question-bank-quiz.snapshot';

const learnerId = '11111111-1111-4111-8111-111111111111';
const lessonId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const orgId = '44444444-4444-4444-8444-444444444444';
const deliveryId = '55555555-5555-4555-8555-555555555555';
const attemptId = '66666666-6666-4666-8666-666666666666';
const versionId = '77777777-7777-4777-8777-777777777777';
const user = { vistaUserId: learnerId, status: 'active', systemPermissions: [], memberships: [] } as any;
const row: IssuedQuestionRow = { question_version_id: versionId, question_id: 'q1', ordinal: 1, points: 2, status: 'published', type: 'single_choice', stem: 'Pick A', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer_key: ['a'], explanation: 'A is correct', objective_count: 1, organization_id: orgId, lesson_id: lessonId };
const issued = issueQuestionBankQuiz([row], assignmentId, lessonId, orgId, 80);

describe('Question Bank quiz through existing attempt and progression services', () => {
  it('starts an attempt with immutable public/private snapshots and unchanged retake allocation', async () => {
    const rootQuery = jest.fn().mockResolvedValue([{ classroom_id: 'class-a', lesson_id: lessonId, assignment_id: assignmentId, challenge_id: null, constraints: { kind: 'knowledge_check', passPercent: 80 }, organization_id: orgId, course_organization_id: orgId, max_attempts: 3 }]);
    const txQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 1, existing: 0 }]).mockResolvedValueOnce([{ id: attemptId, status: 'in_progress' }]).mockResolvedValueOnce([]);
    const progression = { assertPrerequisites: jest.fn(), prepareQuestionBankQuiz: jest.fn().mockResolvedValue(issued) };
    const service = new LearningService({ $queryRaw: rootQuery, $transaction: jest.fn(async (work) => work({ $executeRaw: jest.fn(), $queryRaw: txQuery })) } as never,
      { assertStudentClassroomAccess: jest.fn() } as never, progression as never);
    const result = await service.startAttempt(user, deliveryId) as any;
    expect(result.quiz).toEqual(issued.publicSnapshot);
    expect(JSON.stringify(result)).not.toContain('answerKey');
    expect(progression.prepareQuestionBankQuiz).toHaveBeenCalledWith(expect.anything(), assignmentId, lessonId, orgId, 80);
    expect(String(txQuery.mock.calls[2][0])).toContain('workspace_snapshot');
    expect(String(txQuery.mock.calls[3][0])).toContain('learning_quiz_attempt_grading');
    expect(txQuery.mock.calls[3].some((value: unknown) => typeof value === 'string' && value.includes(issued.privateSnapshot.checksum))).toBe(true);
  });
  it('returns an open quiz attempt unchanged and allocates the next attempt after evaluation', async () => {
    const context = { classroom_id: 'class-a', lesson_id: lessonId, assignment_id: assignmentId, challenge_id: null, constraints: { kind: 'knowledge_check', passPercent: 80 }, organization_id: orgId, course_organization_id: orgId, max_attempts: 3 };
    const progression = { assertPrerequisites: jest.fn(), prepareQuestionBankQuiz: jest.fn().mockResolvedValue(issued) };
    const activeQuery = jest.fn().mockResolvedValueOnce([{ id: attemptId, status: 'in_progress', workspace_snapshot: issued.publicSnapshot }]);
    const openService = new LearningService({ $queryRaw: jest.fn().mockResolvedValue([context]), $transaction: jest.fn(async (work) => work({ $executeRaw: jest.fn(), $queryRaw: activeQuery })) } as never,
      { assertStudentClassroomAccess: jest.fn() } as never, progression as never);
    await expect(openService.startAttempt(user, deliveryId)).resolves.toMatchObject({ id: attemptId, quiz: issued.publicSnapshot });
    expect(activeQuery).toHaveBeenCalledTimes(1);
    expect(progression.prepareQuestionBankQuiz).not.toHaveBeenCalled();

    const retakeId = '88888888-8888-4888-8888-888888888888';
    const retakeQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 2, existing: 1 }]).mockResolvedValueOnce([{ id: retakeId, attempt_number: 2, status: 'in_progress' }]).mockResolvedValueOnce([]);
    const retakeService = new LearningService({ $queryRaw: jest.fn().mockResolvedValue([context]), $transaction: jest.fn(async (work) => work({ $executeRaw: jest.fn(), $queryRaw: retakeQuery })) } as never,
      { assertStudentClassroomAccess: jest.fn() } as never, progression as never);
    await expect(retakeService.startAttempt(user, deliveryId)).resolves.toMatchObject({ id: retakeId, attempt_number: 2, quiz: issued.publicSnapshot });
  });
  it('issues a global canonical quiz to an organization classroom using the course scope', async () => {
    const context = { classroom_id: 'class-a', lesson_id: lessonId, assignment_id: assignmentId, challenge_id: null, constraints: { kind: 'knowledge_check', passPercent: 80 }, organization_id: orgId, course_organization_id: null, max_attempts: 3 };
    const txQuery = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ n: 1, existing: 0 }]).mockResolvedValueOnce([{ id: attemptId, status: 'in_progress' }]).mockResolvedValueOnce([]);
    const progression = { assertPrerequisites: jest.fn(), prepareQuestionBankQuiz: jest.fn().mockResolvedValue(issued) };
    const service = new LearningService({ $queryRaw: jest.fn().mockResolvedValue([context]), $transaction: jest.fn(async (work) => work({ $executeRaw: jest.fn(), $queryRaw: txQuery })) } as never,
      { assertStudentClassroomAccess: jest.fn() } as never, progression as never);
    await expect(service.startAttempt(user, deliveryId)).resolves.toMatchObject({ id: attemptId, quiz: issued.publicSnapshot });
    expect(progression.prepareQuestionBankQuiz).toHaveBeenCalledWith(expect.anything(), assignmentId, lessonId, null, 80);
  });
  it('issues only assigned published versions and refuses Course 1', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ legacy: false }]).mockResolvedValueOnce([row]);
    const progression = new ProgressionService({ $queryRaw: query } as never, {} as never);
    await expect(progression.prepareQuestionBankQuiz({ $queryRaw: query } as never, assignmentId, lessonId, orgId, 80)).resolves.toMatchObject({ publicSnapshot: { assignmentId, passPercent: 80 } });
    expect(String(query.mock.calls[1][0])).toContain('learning_assignment_question_versions');
    const legacy = jest.fn().mockResolvedValue([{ legacy: true }]);
    await expect(progression.prepareQuestionBankQuiz({ $queryRaw: legacy } as never, assignmentId, lessonId, orgId, 80)).rejects.toThrow('Course 1');
  });
  it('does not publish an empty Question Bank quiz assignment', async () => {
    const txQuery = jest.fn().mockResolvedValueOnce([{ id: deliveryId, status: 'draft', constraints: { kind: 'knowledge_check', passPercent: 80 }, challenge_id: null, classroom_status: 'active' }]).mockResolvedValueOnce([{ count: 0, unavailable: 0 }]);
    const service = new LearningService({ $transaction: jest.fn(async (work) => work({ $queryRaw: txQuery })) } as never,
      { assertTeacherClassroomAccess: jest.fn() } as never);
    await expect(service.publishAssignment(user, 'class-a', assignmentId)).rejects.toThrow('requires published QuestionVersions');
    expect(txQuery).toHaveBeenCalledTimes(2);
  });
  it('submits backend score, feedback and in-progress lesson when other conditions are not met', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ attempt_id: attemptId, assignment_id: assignmentId, lesson_id: lessonId, classroom_id: 'class-a', status: 'in_progress', workspace_snapshot: issued.publicSnapshot, grading_snapshot: issued.privateSnapshot }])
      .mockResolvedValueOnce([]) // prerequisites
      .mockResolvedValueOnce([{ id: attemptId }]) // evaluated attempt
      .mockResolvedValueOnce([]) // no published required activity, fail closed
      .mockResolvedValueOnce([]) // lesson in progress
      .mockResolvedValueOnce([]); // final result
    const service = new ProgressionService({ $transaction: jest.fn(async (work) => work({ $queryRaw: query })) } as never, { assertStudentClassroomAccess: jest.fn() } as never);
    const result = await service.submitKnowledgeCheck(user, attemptId, { answers: [{ questionId: versionId, optionId: 'a' }] }) as any;
    expect(result).toMatchObject({ score: 100, passed: true, completedLessonId: null, feedback: [{ correct: true }] });
    expect(String(query.mock.calls[2][0])).toContain("status='evaluated'");
    expect(JSON.stringify(result)).not.toContain('answerKey');
  });
  it('completes a lesson only when the linked required quiz is the remaining condition', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ attempt_id: attemptId, assignment_id: assignmentId, lesson_id: lessonId, classroom_id: 'class-a', status: 'in_progress', workspace_snapshot: issued.publicSnapshot, grading_snapshot: issued.privateSnapshot }])
      .mockResolvedValueOnce([]) // prerequisites
      .mockResolvedValueOnce([{ id: attemptId }]) // evaluated
      .mockResolvedValueOnce([{ id: 'activity-a', type: 'knowledge_check', assignment_id: assignmentId }])
      .mockResolvedValueOnce([{ id: attemptId }]) // evidence
      .mockResolvedValueOnce([]) // lesson advisory lock
      .mockResolvedValueOnce([{ id: 'progress-a', already_completed: false }])
      .mockResolvedValueOnce([{ id: 'next-lesson' }])
      .mockResolvedValueOnce([]); // final result
    const service = new ProgressionService({ $transaction: jest.fn(async (work) => work({ $queryRaw: query })) } as never, { assertStudentClassroomAccess: jest.fn() } as never);
    await expect(service.submitKnowledgeCheck(user, attemptId, { answers: [{ questionId: versionId, optionId: 'a' }] })).resolves.toMatchObject({ completedLessonId: lessonId, newlyUnlockedLessonIds: ['next-lesson'] });
  });
  it('returns the same stored result on double submit without regrading', async () => {
    const stored = { kind: 'question_bank_quiz_result', schemaVersion: 1, attemptId, score: 100, passed: true, completedLessonId: lessonId, newlyUnlockedLessonIds: [] };
    const query = jest.fn().mockResolvedValueOnce([{ attempt_id: attemptId, assignment_id: assignmentId, lesson_id: lessonId, classroom_id: 'class-a', status: 'evaluated', workspace_snapshot: issued.publicSnapshot, result_snapshot: stored }]);
    const service = new ProgressionService({ $transaction: jest.fn(async (work) => work({ $queryRaw: query })) } as never, { assertStudentClassroomAccess: jest.fn() } as never);
    await expect(service.submitKnowledgeCheck(user, attemptId, { answers: [{ questionId: versionId, optionId: 'b' }] })).resolves.toEqual(stored);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('hides another learner attempt and rejects client score/PASS at DTO boundary', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new ProgressionService({ $transaction: jest.fn(async (work) => work({ $queryRaw: query })) } as never, { assertStudentClassroomAccess: jest.fn() } as never);
    await expect(service.submitKnowledgeCheck(user, attemptId, { answers: [{ questionId: versionId, optionId: 'a' }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(() => issueQuestionBankQuiz([{ ...row, status: 'draft' }], assignmentId, lessonId, orgId, 80)).toThrow();
    expect(() => issueQuestionBankQuiz([row], assignmentId, lessonId, 'other-org', 80)).toThrow();
    expect(() => issueQuestionBankQuiz([row], assignmentId, lessonId, orgId, 0)).toThrow();
    expect(() => issueQuestionBankQuiz([], assignmentId, lessonId, orgId, 80)).toThrow();
    expect(() => issueQuestionBankQuiz([row], assignmentId, lessonId, orgId, 80)).not.toThrow(BadRequestException);
  });
});
