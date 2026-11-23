export interface ScheduleInput { availableFrom: string; dueAt: string; closeAt: string; maxAttempts: string }
export type ScheduleErrors = Partial<Record<keyof ScheduleInput, string>>;

const time = (value: string) => (value ? new Date(value).getTime() : Number.NaN);

/** Validate the public schedule constraints before sending a classroom quiz delivery request. */
export function validateSchedule(input: ScheduleInput): ScheduleErrors {
  const errors: ScheduleErrors = {};
  const opens = time(input.availableFrom);
  const due = time(input.dueAt);
  const closes = time(input.closeAt);
  if (input.dueAt && input.availableFrom && due < opens) errors.dueAt = 'The due date can’t be before the quiz opens.';
  if (input.closeAt && input.availableFrom && closes <= opens) errors.closeAt = 'The quiz must close after it opens.';
  else if (input.closeAt && input.dueAt && closes < due) errors.closeAt = 'The quiz can’t close before it’s due.';
  if (input.maxAttempts.trim()) {
    const attempts = Number(input.maxAttempts);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 100) {
      errors.maxAttempts = 'Enter a whole number from 1 to 100, or leave it empty for unlimited attempts.';
    }
  }
  return errors;
}

/** Convert datetime-local wall-clock values to API ISO instants. */
const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

export function scheduleBody(quizId: string, input: ScheduleInput) {
  const body: { canonicalAssignmentId: string; availableFrom?: string; dueAt?: string; closeAt?: string; maxAttempts?: number } = {
    canonicalAssignmentId: quizId,
  };
  const availableFrom = toIso(input.availableFrom);
  const dueAt = toIso(input.dueAt);
  const closeAt = toIso(input.closeAt);
  if (availableFrom) body.availableFrom = availableFrom;
  if (dueAt) body.dueAt = dueAt;
  if (closeAt) body.closeAt = closeAt;
  if (input.maxAttempts.trim()) body.maxAttempts = Number(input.maxAttempts);
  return body;
}
