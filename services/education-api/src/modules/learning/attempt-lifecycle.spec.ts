import { ConflictException, NotFoundException } from '@nestjs/common';
import { assertAttemptOpen, assignmentAcceptsAttachments, loadOwnAttempt, type AttemptState } from './attempt-lifecycle';

const open = (over: Partial<AttemptState> = {}): AttemptState => ({
  attempt_id: 'a', learner_user_id: 'u', attempt_status: 'in_progress', program_id: 'p', classroom_assignment_id: 'ca', classroom_id: 'c', assignment_id: 'as',
  assignment_constraints: { kind: 'symbolic_program' }, delivery_status: 'published', available_from: null, close_at: null, ...over,
});
const codeOf = (fn: () => void) => { try { fn(); } catch (e) { return (e as ConflictException).getResponse() as { code: string }; } return null; };
const now = new Date('2026-11-12T10:00:00Z');

describe('assertAttemptOpen', () => {
  it('accepts an in-progress attempt of a published, available, open delivery', () => {
    expect(() => assertAttemptOpen(open(), now)).not.toThrow();
    expect(() => assertAttemptOpen(open({ available_from: new Date('2026-11-01'), close_at: new Date('2026-12-01') }), now)).not.toThrow();
  });
  it.each(['submitted', 'evaluated', 'abandoned'])('rejects an attempt that is %s (invalid transition / repeated final submission)', (status) => {
    expect(codeOf(() => assertAttemptOpen(open({ attempt_status: status }), now))).toEqual(expect.objectContaining({ code: 'ATTEMPT_NOT_IN_PROGRESS' }));
  });
  it.each(['draft', 'closed', 'archived'])('rejects a %s delivery', (delivery_status) => {
    expect(codeOf(() => assertAttemptOpen(open({ delivery_status }), now))).toEqual(expect.objectContaining({ code: 'ASSIGNMENT_NOT_AVAILABLE' }));
  });
  it('rejects work before available_from and after close_at, but not merely after due date', () => {
    expect(codeOf(() => assertAttemptOpen(open({ available_from: new Date('2026-11-13') }), now))).toEqual(expect.objectContaining({ code: 'ASSIGNMENT_NOT_AVAILABLE' }));
    expect(codeOf(() => assertAttemptOpen(open({ close_at: new Date('2026-11-12T09:59:59Z') }), now))).toEqual(expect.objectContaining({ code: 'ASSIGNMENT_CLOSED' }));
    expect(codeOf(() => assertAttemptOpen(open({ close_at: new Date('2026-11-12T10:00:00Z') }), now))).toEqual(expect.objectContaining({ code: 'ASSIGNMENT_CLOSED' }));
  });
});

describe('assignmentAcceptsAttachments (opt-in)', () => {
  it.each([
    [{ kind: 'symbolic_program', attachments: { enabled: true } }, true], [{ attachments: { enabled: true } }, true],
    [{ kind: 'symbolic_program' }, false], [{}, false], [null, false], [{ attachments: true }, false], [{ attachments: { enabled: false } }, false],
    [{ kind: 'knowledge_check', attachments: { enabled: true } }, false], [{ kind: 'physical_lab', attachments: { enabled: true } }, false],
  ])('%j -> %s', (constraints, expected) => {
    expect(assignmentAcceptsAttachments(constraints)).toBe(expected);
  });
});

describe('loadOwnAttempt', () => {
  it('returns only the caller\'s attempt and hides every other attempt as not found', async () => {
    const found = jest.fn().mockResolvedValue([open()]);
    await expect(loadOwnAttempt({ $queryRaw: found } as never, 'u', 'a')).resolves.toMatchObject({ attempt_id: 'a' });
    await expect(loadOwnAttempt({ $queryRaw: jest.fn().mockResolvedValue([]) } as never, 'other', 'a', true)).rejects.toBeInstanceOf(NotFoundException);
  });
});
