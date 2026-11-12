import type { ApiAttemptHistoryItem } from '../../lib/api';

/** Pure presentation rules for the student assignment lifecycle (no I/O, unit tested). */
export type AssignmentKind = 'quiz' | 'programming' | 'other';
export type WindowState = 'not_open' | 'open' | 'due_soon' | 'past_due' | 'closed';
export type AttemptTone = 'neutral' | 'accent' | 'ok' | 'warn';

export function assignmentKind(constraints: unknown): AssignmentKind {
  const kind = constraints && typeof constraints === 'object' && !Array.isArray(constraints) ? (constraints as { kind?: unknown }).kind : undefined;
  if (kind === 'knowledge_check') return 'quiz';
  if (kind === 'symbolic_program') return 'programming';
  return 'other';
}

export const kindLabel: Record<AssignmentKind, string> = { quiz: 'Knowledge check', programming: 'Programming assignment', other: 'Assignment' };

/** Mirrors the server rule: attachments are opt-in (`constraints.attachments.enabled === true`) and never offered for quizzes or physical labs. */
export function acceptsAttachments(constraints: unknown): boolean {
  const record = constraints && typeof constraints === 'object' && !Array.isArray(constraints) ? constraints as { kind?: unknown; attachments?: unknown } : undefined;
  if (!record || record.kind === 'knowledge_check' || record.kind === 'physical_lab') return false;
  return Boolean(record.attachments && typeof record.attachments === 'object' && (record.attachments as { enabled?: unknown }).enabled === true);
}

export function windowState(input: { status?: string; available_from?: string | null; due_at?: string | null; close_at?: string | null }, now = new Date()): WindowState {
  if (input.status === 'closed' || input.status === 'archived') return 'closed';
  if (input.close_at && new Date(input.close_at) <= now) return 'closed';
  if (input.available_from && new Date(input.available_from) > now) return 'not_open';
  if (input.due_at) {
    const due = new Date(input.due_at);
    if (due <= now) return 'past_due';
    if (due.getTime() - now.getTime() <= 48 * 3600_000) return 'due_soon';
  }
  return 'open';
}

export const windowLabel: Record<WindowState, string> = {
  not_open: 'Not open yet', open: 'Open', due_soon: 'Due soon', past_due: 'Past due (late work still accepted)', closed: 'Closed',
};

export function attemptPresentation(attempt: Pick<ApiAttemptHistoryItem, 'status' | 'grading_released' | 'passed' | 'submission_id'>, kind: AssignmentKind): { label: string; tone: AttemptTone; final: boolean } {
  if (attempt.status === 'in_progress') return { label: 'In progress', tone: 'accent', final: false };
  if (attempt.status === 'abandoned') return { label: 'Abandoned', tone: 'neutral', final: true };
  if (kind === 'quiz') return { label: attempt.passed ? 'Passed' : 'Not passed', tone: attempt.passed ? 'ok' : 'warn', final: true };
  if (attempt.grading_released) return { label: 'Graded', tone: 'ok', final: true };
  return { label: attempt.status === 'evaluated' ? 'Evaluated · awaiting review' : 'Submitted · awaiting review', tone: 'neutral', final: true };
}

/** Which action the primary button offers: resume the open attempt, start a new one, or nothing. */
export function nextAction(attempts: Array<Pick<ApiAttemptHistoryItem, 'id' | 'status'>>, win: WindowState, maxAttempts: number | null | undefined):
  { kind: 'continue'; attemptId: string } | { kind: 'start' } | { kind: 'blocked'; reason: string } {
  const open = attempts.find((a) => a.status === 'in_progress');
  if (open) return win === 'closed' ? { kind: 'blocked', reason: 'This assignment is closed.' } : { kind: 'continue', attemptId: open.id };
  if (win === 'closed') return { kind: 'blocked', reason: 'This assignment is closed.' };
  if (win === 'not_open') return { kind: 'blocked', reason: 'This assignment is not open yet.' };
  if (typeof maxAttempts === 'number' && attempts.length >= maxAttempts) return { kind: 'blocked', reason: 'Maximum attempts reached.' };
  return { kind: 'start' };
}

export const formatBytes = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function gradeSummary(scores: Array<{ awardedPoints: number | string; maxPoints: number | string }>): { awarded: number; max: number } {
  return scores.reduce((sum, s) => ({ awarded: sum.awarded + Number(s.awardedPoints), max: sum.max + Number(s.maxPoints) }), { awarded: 0, max: 0 });
}
