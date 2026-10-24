import { describe, expect, it } from 'vitest';
import { allowsPhysicalExecution, nextAttemptAction, studentLearningKeys } from './studentLearningQueries';

describe('student learning query contract', () => {
  it('scopes assignment and attempt evidence keys', () => {
    expect(studentLearningKeys.assignment('delivery-a')).not.toEqual(studentLearningKeys.assignment('delivery-b'));
    expect(studentLearningKeys.practice('attempt-a')).not.toEqual(studentLearningKeys.practice('attempt-b'));
  });
  it('continues only an in-progress attempt and starts again after submission or evaluation', () => {
    expect(nextAttemptAction({ id: 'a1', status: 'in_progress' })).toEqual({ kind: 'continue', attemptId: 'a1' });
    expect(nextAttemptAction({ id: 'a1', status: 'submitted' })).toEqual({ kind: 'start' });
    expect(nextAttemptAction({ id: 'a1', status: 'evaluated' })).toEqual({ kind: 'start' });
    expect(nextAttemptAction(null)).toEqual({ kind: 'start' });
  });
  it('isolates the WF-02 learning route from physical execution',()=>{expect(allowsPhysicalExecution('learning')).toBe(false);expect(allowsPhysicalExecution('physical-enabled')).toBe(true);});
});
