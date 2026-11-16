import { describe, expect, it } from 'vitest';
import type { ApiInstructorSubmission } from '../lib/api';
import { attemptHistory, criterionError, filterSubmissions, scoreTotals, submissionStage, summarizeSubmissions } from './teacherSubmissionsModel';

const item = (over: Partial<ApiInstructorSubmission>): ApiInstructorSubmission => ({ id: 's', assignment_id: 'a1', learner_user_id: 'u1', status: 'submitted', submitted_at: null, review_status: 'unreviewed', full_name: 'VISTA Demo Student', email: 'demo@example.test', attempt_number: 1, ...over });

describe('submissionStage', () => {
  it('release wins over assessment; assessment wins over waiting', () => {
    expect(submissionStage(item({}))).toBe('awaiting');
    expect(submissionStage(item({ review_status: 'assessed' }))).toBe('assessed');
    expect(submissionStage(item({ review_status: 'assessed', grading_released_at: '2026-11-13T00:00:00Z' }))).toBe('released');
    expect(submissionStage(item({ attempt: { id: 'x', attemptNumber: 1, gradingReleasedAt: '2026-11-13T00:00:00Z' } }))).toBe('released');
  });
  it('summaries add up to the total', () => {
    const list = [item({}), item({ review_status: 'assessed' }), item({ grading_released_at: 'x' })];
    expect(summarizeSubmissions(list)).toEqual({ total: 3, awaiting: 1, assessed: 1, released: 1 });
  });
});

describe('filters and history', () => {
  const list = [item({ id: '1', attempt_number: 2 }), item({ id: '2', attempt_number: 1 }), item({ id: '3', learner_user_id: 'u2', full_name: 'Other', email: null, assignment_id: 'a2' })];
  it('filters by assignment, stage and student name or email', () => {
    expect(filterSubmissions(list, { assignmentId: 'a2', search: '', stage: 'all' })).toHaveLength(1);
    expect(filterSubmissions(list, { assignmentId: '', search: 'DEMO@', stage: 'all' })).toHaveLength(2);
    expect(filterSubmissions(list, { assignmentId: '', search: '', stage: 'released' })).toHaveLength(0);
  });
  it('lists the same student’s attempts of the same assignment, oldest first', () => {
    expect(attemptHistory(list, list[0]).map((entry) => entry.id)).toEqual(['2', '1']);
  });
});

describe('grading helpers', () => {
  const criteria = [{ id: 'c1', maxPoints: '10.00' }, { id: 'c2', maxPoints: 5 }];
  it('totals only entered numeric scores and reports completeness', () => {
    expect(scoreTotals(criteria, { c1: '7.5' })).toEqual({ max: 15, total: 7.5, complete: false });
    expect(scoreTotals(criteria, { c1: '10', c2: '5' })).toEqual({ max: 15, total: 15, complete: true });
  });
  it('validates a criterion score against its maximum', () => {
    expect(criterionError('', 10)).toBeTruthy(); expect(criterionError('abc', 10)).toBeTruthy();
    expect(criterionError('-1', 10)).toMatch(/negative/); expect(criterionError('11', '10.00')).toMatch(/10/);
    expect(criterionError('10', '10.00')).toBe('');
  });
});
