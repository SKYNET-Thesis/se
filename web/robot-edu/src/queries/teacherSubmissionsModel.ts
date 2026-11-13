import type { ApiInstructorSubmission } from '../lib/api';

/** Review pipeline of one submitted attempt, derived only from fields the API returns. */
export type SubmissionStage = 'awaiting' | 'assessed' | 'released';
export type StageFilter = 'all' | SubmissionStage;

export function submissionStage(item: Pick<ApiInstructorSubmission, 'grading_released_at' | 'attempt' | 'review_status'>): SubmissionStage {
  if (item.grading_released_at || item.attempt?.gradingReleasedAt) return 'released';
  return item.review_status === 'assessed' ? 'assessed' : 'awaiting';
}

export const stageLabel: Record<SubmissionStage, string> = { awaiting: 'Awaiting assessment', assessed: 'Assessed · not released', released: 'Released' };

export function summarizeSubmissions(items: ApiInstructorSubmission[]) {
  const counts = { total: items.length, awaiting: 0, assessed: 0, released: 0 };
  for (const item of items) counts[submissionStage(item)] += 1;
  return counts;
}

export interface SubmissionFilters { assignmentId: string; search: string; stage: StageFilter }

export function filterSubmissions(items: ApiInstructorSubmission[], filters: SubmissionFilters) {
  const needle = filters.search.trim().toLowerCase();
  return items.filter((item) =>
    (!filters.assignmentId || item.assignment_id === filters.assignmentId) &&
    (filters.stage === 'all' || submissionStage(item) === filters.stage) &&
    (!needle || `${item.full_name ?? ''} ${item.email ?? ''}`.toLowerCase().includes(needle)));
}

/** Other submitted attempts of the same student for the same assignment, oldest first. */
export function attemptHistory(items: ApiInstructorSubmission[], current: Pick<ApiInstructorSubmission, 'learner_user_id' | 'assignment_id'>) {
  return items
    .filter((item) => item.learner_user_id === current.learner_user_id && item.assignment_id === current.assignment_id)
    .sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0));
}

export function scoreTotals(criteria: Array<{ id: string; maxPoints: number | string }>, points: Record<string, string>) {
  const max = criteria.reduce((sum, item) => sum + Number(item.maxPoints), 0);
  const entered = criteria.filter((item) => (points[item.id] ?? '').trim() !== '' && Number.isFinite(Number(points[item.id])));
  return { max, total: entered.reduce((sum, item) => sum + Number(points[item.id]), 0), complete: entered.length === criteria.length };
}

/** Per-criterion validation message for the grading form (empty string = valid). */
export function criterionError(raw: string | undefined, maxPoints: number | string): string {
  const text = (raw ?? '').trim();
  if (!text) return 'Enter a score.';
  const value = Number(text);
  if (!Number.isFinite(value)) return 'Enter a number.';
  if (value < 0) return 'The score cannot be negative.';
  if (value > Number(maxPoints)) return `The maximum is ${Number(maxPoints)}.`;
  return '';
}

export const formatDateTime = (value: string | null | undefined) => (value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded');
