import { describe, expect, it } from 'vitest';
import { scheduleBody, validateSchedule, type ScheduleInput } from './quizDeliveryModel';

const empty: ScheduleInput = { availableFrom: '', dueAt: '', closeAt: '', maxAttempts: '' };

describe('quiz delivery schedule', () => {
  it('accepts an empty schedule and leaves attempts unlimited', () => {
    expect(validateSchedule(empty)).toEqual({});
    expect(scheduleBody('quiz-1', empty)).toEqual({ canonicalAssignmentId: 'quiz-1' });
  });

  it('rejects due and close times that contradict the opening time', () => {
    expect(validateSchedule({ ...empty, availableFrom: '2026-11-24T12:00', dueAt: '2026-11-24T11:00', closeAt: '2026-11-24T11:30' })).toEqual({
      dueAt: 'The due date can’t be before the quiz opens.',
      closeAt: 'The quiz must close after it opens.',
    });
  });

  it('rejects a close time before the due time and non-integer attempt counts', () => {
    expect(validateSchedule({ ...empty, dueAt: '2026-11-25T12:00', closeAt: '2026-11-25T11:00', maxAttempts: '2.5' })).toEqual({
      closeAt: 'The quiz can’t close before it’s due.',
      maxAttempts: 'Enter a whole number from 1 to 100, or leave it empty for unlimited attempts.',
    });
  });

  it('serializes a valid local schedule into API instants', () => {
    expect(scheduleBody('quiz-1', { ...empty, availableFrom: '2026-11-24T12:00', dueAt: '2026-11-25T12:00', maxAttempts: '3' })).toMatchObject({
      canonicalAssignmentId: 'quiz-1',
      availableFrom: new Date('2026-11-24T12:00').toISOString(),
      dueAt: new Date('2026-11-25T12:00').toISOString(),
      maxAttempts: 3,
    });
  });
});
