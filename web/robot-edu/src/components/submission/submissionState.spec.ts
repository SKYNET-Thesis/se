import { describe, expect, it } from 'vitest';
import { acceptsAttachments, assignmentKind, attemptPresentation, formatBytes, gradeSummary, nextAction, windowState } from './submissionState';

const now = new Date('2026-11-12T10:00:00Z');
const h = (hours: number) => new Date(now.getTime() + hours * 3600_000).toISOString();

describe('assignmentKind / acceptsAttachments', () => {
  it('classifies assignments by their constraints', () => {
    expect(assignmentKind({ kind: 'knowledge_check' })).toBe('quiz');
    expect(assignmentKind({ kind: 'symbolic_program' })).toBe('programming');
    expect(assignmentKind({})).toBe('other');
    expect(assignmentKind(null)).toBe('other');
    expect(assignmentKind([])).toBe('other');
  });
  it('offers attachments only when explicitly enabled and never for quizzes or physical labs', () => {
    expect(acceptsAttachments({ kind: 'symbolic_program', attachments: { enabled: true } })).toBe(true);
    expect(acceptsAttachments({ kind: 'symbolic_program' })).toBe(false);
    expect(acceptsAttachments({ attachments: { enabled: true } })).toBe(true);
    expect(acceptsAttachments({ kind: 'knowledge_check', attachments: { enabled: true } })).toBe(false);
    expect(acceptsAttachments({ kind: 'physical_lab', attachments: { enabled: true } })).toBe(false);
    expect(acceptsAttachments(null)).toBe(false);
  });
});

describe('windowState', () => {
  it('derives availability, due and closed states', () => {
    expect(windowState({ status: 'published' }, now)).toBe('open');
    expect(windowState({ status: 'published', available_from: h(2) }, now)).toBe('not_open');
    expect(windowState({ status: 'published', due_at: h(24) }, now)).toBe('due_soon');
    expect(windowState({ status: 'published', due_at: h(200) }, now)).toBe('open');
    expect(windowState({ status: 'published', due_at: h(-1), close_at: h(10) }, now)).toBe('past_due');
    expect(windowState({ status: 'published', due_at: h(-10), close_at: h(-1) }, now)).toBe('closed');
    expect(windowState({ status: 'closed' }, now)).toBe('closed');
  });
});

describe('nextAction', () => {
  const a = (id: string, status: string) => ({ id, status });
  it('resumes the open attempt, starts a new one, or explains why not', () => {
    expect(nextAction([a('x', 'in_progress'), a('y', 'submitted')], 'open', null)).toEqual({ kind: 'continue', attemptId: 'x' });
    expect(nextAction([], 'open', null)).toEqual({ kind: 'start' });
    expect(nextAction([a('y', 'submitted')], 'past_due', 3)).toEqual({ kind: 'start' });
    expect(nextAction([a('y', 'submitted')], 'open', 1)).toEqual({ kind: 'blocked', reason: 'Maximum attempts reached.' });
    expect(nextAction([], 'closed', null)).toMatchObject({ kind: 'blocked' });
    expect(nextAction([], 'not_open', null)).toMatchObject({ kind: 'blocked' });
    expect(nextAction([a('x', 'in_progress')], 'closed', null)).toMatchObject({ kind: 'blocked' });
  });
});

describe('attemptPresentation', () => {
  const base = { status: 'submitted', grading_released: false, passed: null, submission_id: 's' };
  it('never shows a grade before release and labels quizzes by their auto-graded result', () => {
    expect(attemptPresentation({ ...base, status: 'in_progress' }, 'programming')).toMatchObject({ label: 'In progress', final: false });
    expect(attemptPresentation(base, 'programming')).toMatchObject({ label: 'Submitted · awaiting review', final: true });
    expect(attemptPresentation({ ...base, status: 'evaluated' }, 'programming').label).toBe('Evaluated · awaiting review');
    expect(attemptPresentation({ ...base, grading_released: true }, 'programming')).toMatchObject({ label: 'Graded', tone: 'ok' });
    expect(attemptPresentation({ ...base, status: 'evaluated', passed: true, grading_released: true }, 'quiz')).toMatchObject({ label: 'Passed' });
    expect(attemptPresentation({ ...base, status: 'evaluated', passed: false, grading_released: true }, 'quiz')).toMatchObject({ label: 'Not passed' });
  });
});

describe('formatting', () => {
  it('formats sizes and totals scores', () => {
    expect(formatBytes(500)).toBe('1 KB'); expect(formatBytes(2048)).toBe('2 KB'); expect(formatBytes(5 * 1048576)).toBe('5.0 MB');
    expect(gradeSummary([{ awardedPoints: '4', maxPoints: 10 }, { awardedPoints: 2.5, maxPoints: '5' }])).toEqual({ awarded: 6.5, max: 15 });
  });
});
