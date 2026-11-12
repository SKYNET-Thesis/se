import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ProgressionService } from './progression.service';

const user = { vistaUserId: 'u1', status: 'active', memberships: [] } as never;
const open = (over: Record<string, unknown> = {}) => ({ attempt_id: 'a1', learner_user_id: 'u1', attempt_status: 'in_progress', program_id: null, classroom_assignment_id: 'ca', classroom_id: 'class-1', assignment_id: 'as', assignment_constraints: { kind: 'knowledge_check' }, delivery_status: 'published', available_from: null, close_at: null, ...over });
const snapshot = { kind: 'question_bank_quiz', questions: [{ questionVersionId: 'q1', options: [{ id: 'o1' }, { id: 'o2' }] }, { questionVersionId: 'q2', options: [{ id: 'o3' }] }] };

function build(opts: { attempt?: Record<string, unknown>; snapshot?: unknown; deny?: boolean; saved?: unknown[] } = {}) {
  const tx = { $queryRaw: jest.fn() };
  tx.$queryRaw.mockResolvedValueOnce([open(opts.attempt)]).mockResolvedValueOnce([{ workspace_snapshot: opts.snapshot === undefined ? snapshot : opts.snapshot }]).mockResolvedValueOnce(opts.saved ?? [{ draft_saved_at: new Date('2026-11-12') }]);
  const prisma = { $transaction: jest.fn(async (work: (t: typeof tx) => unknown) => work(tx)) };
  const assertStudentClassroomAccess = jest.fn(async (_u: unknown, _c: unknown, o?: { requireActiveEnrollment?: boolean }) => { if (opts.deny && o?.requireActiveEnrollment) throw new NotFoundException('Assignment was not found.'); });
  return { service: new ProgressionService(prisma as never, { assertStudentClassroomAccess } as never), tx, assertStudentClassroomAccess };
}

describe('ProgressionService.saveQuizDraft', () => {
  it('stores only the learner\'s own selections, without grading, with active enrollment enforced', async () => {
    const t = build();
    const result = await t.service.saveQuizDraft(user, 'a1', { answers: [{ questionId: 'q1', optionId: 'o1' }, { questionId: 'q2', optionIds: ['o3'] }] });
    expect(t.assertStudentClassroomAccess).toHaveBeenCalledWith(user, 'class-1', { requireActiveEnrollment: true });
    expect(result.answers).toEqual([{ questionId: 'q1', optionId: 'o1' }, { questionId: 'q2', optionIds: ['o3'] }]);
    const write = t.tx.$queryRaw.mock.calls[2];
    expect(String((write[0] as string[]).join('?'))).toContain('draft_response');
    expect(JSON.stringify(result)).not.toMatch(/answerKey|correct|explanation|score/);
  });
  it('allows a partial draft', async () => {
    await expect(build().service.saveQuizDraft(user, 'a1', { answers: [] })).resolves.toMatchObject({ answers: [] });
  });
  it.each([
    ['an unknown question', [{ questionId: 'zz', optionId: 'o1' }]],
    ['a duplicate question', [{ questionId: 'q1', optionId: 'o1' }, { questionId: 'q1', optionId: 'o2' }]],
    ['an option of another question', [{ questionId: 'q1', optionId: 'o3' }]],
  ])('rejects %s', async (_n, answers) => {
    await expect(build().service.saveQuizDraft(user, 'a1', { answers })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejects a revoked enrollment, a submitted attempt, a closed delivery and non-quiz attempts', async () => {
    await expect(build({ deny: true }).service.saveQuizDraft(user, 'a1', { answers: [] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ attempt: { attempt_status: 'evaluated' } }).service.saveQuizDraft(user, 'a1', { answers: [] })).rejects.toMatchObject({ response: { code: 'ATTEMPT_NOT_IN_PROGRESS' } });
    await expect(build({ attempt: { close_at: new Date(Date.now() - 5) } }).service.saveQuizDraft(user, 'a1', { answers: [] })).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_CLOSED' } });
    await expect(build({ snapshot: {} }).service.saveQuizDraft(user, 'a1', { answers: [] })).rejects.toMatchObject({ response: { code: 'DRAFT_NOT_SUPPORTED' } });
  });
  it('does not touch another learner\'s attempt', async () => {
    const t = build();
    t.tx.$queryRaw.mockReset().mockResolvedValueOnce([]);
    await expect(t.service.saveQuizDraft(user, 'a1', { answers: [] })).rejects.toBeInstanceOf(NotFoundException);
  });
  it('is a conflict when the attempt left in_progress between the check and the write', async () => {
    await expect(build({ saved: [] }).service.saveQuizDraft(user, 'a1', { answers: [] })).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('quiz window (assertQuizWindowOpen)', () => {
  const service = new ProgressionService({} as never, {} as never);
  const check = (row: Record<string, unknown>) => (service as unknown as { assertQuizWindowOpen: (r: unknown) => void }).assertQuizWindowOpen(row);
  it('accepts an open delivery and rejects closed, archived and past close_at', () => {
    expect(() => check({ delivery_status: 'published', close_at: null })).not.toThrow();
    expect(() => check({ delivery_status: 'published', close_at: new Date(Date.now() + 60_000) })).not.toThrow();
    for (const row of [{ delivery_status: 'closed' }, { delivery_status: 'archived' }, { delivery_status: 'published', close_at: new Date(Date.now() - 1) }]) {
      expect(() => check(row)).toThrow(ConflictException);
    }
  });
});
