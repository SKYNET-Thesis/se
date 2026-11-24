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

export interface DeliveryScheduleFields { status?: string | null; available_from?: string | null; due_at?: string | null; close_at?: string | null; max_attempts?: number | null }

/** What a delivery's status means for learners, in plain words (a draft is invisible to them). */
export function deliveryStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'draft': return 'Draft — not visible to students';
    case 'published': return 'Published';
    case 'archived': return 'Archived';
    case 'closed': return 'Closed';
    default: return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown status';
  }
}

const fmt = (iso: string, locale?: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

/** The schedule and attempt rule of a delivery as short phrases, e.g. ["Opens Nov 3, 2026, 9:00 AM", "3 attempts"]. */
export function describeSchedule(delivery: DeliveryScheduleFields, locale?: string): string[] {
  const parts: string[] = [];
  if (delivery.available_from) parts.push(`Opens ${fmt(delivery.available_from, locale)}`);
  if (delivery.due_at) parts.push(`Due ${fmt(delivery.due_at, locale)}`);
  if (delivery.close_at) parts.push(`Closes ${fmt(delivery.close_at, locale)}`);
  if (!parts.length) parts.push('Open as soon as it is published');
  const attempts = delivery.max_attempts;
  parts.push(attempts ? `${attempts} ${attempts === 1 ? 'attempt' : 'attempts'}` : 'Unlimited attempts');
  return parts;
}
