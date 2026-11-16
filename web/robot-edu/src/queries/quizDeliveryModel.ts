import { ApiError, type ApiClassroomAssignment } from '../lib/api';
import { teacherLearningKeys } from './teacherLearningQueries';

/**
 * A04 quiz delivery, following LearningService (education-api):
 * - GET  classrooms/:id/published-quizzes — needs `learning.delivery.manage` on the classroom (classroom teacher/TA or
 *   school admin). Lists only quizzes that are ready and not yet assigned here, and is empty unless the classroom is
 *   active.
 * - POST classrooms/:id/quiz-deliveries {canonicalAssignmentId, availableFrom?, dueAt?, closeAt?, maxAttempts? 1–100}
 *   creates a *draft*. 400 when the dates are out of order, 404 when the quiz is no longer eligible (or the classroom
 *   is not active), 409 when it is already assigned.
 * - POST classrooms/:id/assignments/:assignmentId/publish — 404 unknown, 409 inactive classroom, closed/archived
 *   delivery, or unpublished questions. Publishing an already published delivery is a no-op.
 * - GET  classrooms/:id/assignments — everyone with classroom access; drafts only for managers.
 * There is no unpublish, edit-schedule or delete endpoint for a quiz delivery.
 */
export const quizDeliveryKeys = {
  readyQuizzes: (classroomId: string) => [...teacherLearningKeys.classroom(classroomId), 'ready-quizzes'] as const,
  /** Shared with the teacher classroom page so both show the same deliveries. */
  deliveries: (classroomId: string) => teacherLearningKeys.assignments(classroomId),
};

export const isQuizDelivery = (row: Pick<ApiClassroomAssignment, 'constraints' | 'challenge_id'>) =>
  (row.constraints as { kind?: string } | null | undefined)?.kind === 'knowledge_check' && !row.challenge_id;

export type DeliveryPhase = { key: 'draft' | 'scheduled' | 'open' | 'closed' | 'archived' | 'unavailable'; label: string; tone: 'neutral' | 'accent' | 'ok' | 'outline'; note: string };

const time = (value?: string | null) => (value ? new Date(value).getTime() : Number.NaN);

/**
 * What students experience right now, from the server status and the delivery window. Students can only start a quiz
 * in an active classroom (startAttempt joins classroom.status='active'), so a published quiz in an archived classroom is
 * unavailable rather than open.
 */
export function deliveryPhase(row: Pick<ApiClassroomAssignment, 'status' | 'available_from' | 'close_at'>, now = Date.now(), classroomActive = true): DeliveryPhase {
  if (row.status === 'draft') return { key: 'draft', label: 'Draft', tone: 'neutral', note: 'Students can’t see it yet.' };
  if (row.status === 'archived') return { key: 'archived', label: 'Archived', tone: 'outline', note: 'No longer available to students.' };
  if (row.status === 'closed' || time(row.close_at) <= now) return { key: 'closed', label: 'Closed', tone: 'outline', note: 'Students can no longer start it.' };
  if (!classroomActive) return { key: 'unavailable', label: 'Unavailable', tone: 'outline', note: 'The classroom isn’t active, so students can’t start it.' };
  if (time(row.available_from) > now) return { key: 'scheduled', label: 'Scheduled', tone: 'accent', note: 'Published. Students can start it once it opens.' };
  return { key: 'open', label: 'Open', tone: 'ok', note: 'Students can take it now.' };
}

export const formatWhen = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export interface ScheduleInput { availableFrom: string; dueAt: string; closeAt: string; maxAttempts: string }
export type ScheduleErrors = Partial<Record<keyof ScheduleInput, string>>;

/** `datetime-local` values are local wall-clock times; the API takes ISO-8601 instants. */
export const toIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

/** Mirrors the server's rules (date order, whole attempts 1–100) so the request is only sent when it can succeed. */
export function validateSchedule(input: ScheduleInput): ScheduleErrors {
  const errors: ScheduleErrors = {};
  const opens = time(input.availableFrom); const due = time(input.dueAt); const closes = time(input.closeAt);
  if (input.dueAt && input.availableFrom && due < opens) errors.dueAt = 'The due date can’t be before the quiz opens.';
  if (input.closeAt && input.availableFrom && closes <= opens) errors.closeAt = 'The quiz must close after it opens.';
  else if (input.closeAt && input.dueAt && closes < due) errors.closeAt = 'The quiz can’t close before it’s due.';
  if (input.maxAttempts.trim()) {
    const attempts = Number(input.maxAttempts);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 100) errors.maxAttempts = 'Enter a whole number from 1 to 100, or leave it empty for unlimited attempts.';
  }
  return errors;
}

export function scheduleBody(quizId: string, input: ScheduleInput) {
  const body: { canonicalAssignmentId: string; availableFrom?: string; dueAt?: string; closeAt?: string; maxAttempts?: number } = { canonicalAssignmentId: quizId };
  const availableFrom = toIso(input.availableFrom); const dueAt = toIso(input.dueAt); const closeAt = toIso(input.closeAt);
  if (availableFrom) body.availableFrom = availableFrom;
  if (dueAt) body.dueAt = dueAt;
  if (closeAt) body.closeAt = closeAt;
  if (input.maxAttempts.trim()) body.maxAttempts = Number(input.maxAttempts);
  return body;
}

/** 404 and 409 (other than a quiz access denial) mean the screen no longer matches the server: refresh what is shown. */
export const isStaleQuizError = (error: unknown) => error instanceof ApiError && (error.status === 404 || error.status === 409) && !isQuizAccessDenied(error);

/**
 * The learning scope guards (LearningScopeService.assertClassroomAccess / assertTeacherClassroomPermission) answer
 * 'Classroom was not found.' with 404 when the account lacks quiz delivery access (learning.delivery.manage on its
 * school or teacher membership), not only when the classroom is gone. This page only opens classrooms that an
 * authorized classroom list just returned, so this 404 means "no quiz access here", never "deleted".
 */
export const isQuizAccessDenied = (error: unknown) => error instanceof ApiError && error.status === 404 && /^classroom was not found/i.test(error.message.trim());

export const QUIZ_ACCESS_MESSAGE = 'Your account can’t manage quizzes for this classroom. Quiz delivery may not be included in your role. Ask your VISTA administrator to check your access.';

export type QuizAction = 'load' | 'assign' | 'publish';

export function quizDeliveryErrorMessage(error: unknown, action: QuizAction): string {
  if (error instanceof TypeError) return 'VISTA couldn’t be reached. Check your connection, then try again.';
  if (!(error instanceof ApiError)) return error instanceof Error && error.message ? error.message : 'Something went wrong. Try again.';
  const message = error.message ?? '';
  if (error.status === 401) return 'Your session has ended. Sign in again, then try again.';
  if (error.status === 403 || isQuizAccessDenied(error)) return QUIZ_ACCESS_MESSAGE;
  if (action === 'assign') {
    if (error.status === 400 && /dates must be ordered/i.test(message)) return 'Check the dates: the quiz must open before it’s due, and close after it opens and no earlier than the due date.';
    if (error.status === 400) return 'Some settings weren’t accepted. Check the dates and the number of attempts, then try again.';
    if (error.status === 404) return 'This quiz can’t be assigned any more. It may have been unpublished, or the classroom’s course or status changed. The list has been refreshed.';
    if (error.status === 409) return 'This quiz is already assigned to this classroom. The list has been refreshed.';
  }
  if (action === 'publish') {
    if (error.status === 404) return 'This quiz is no longer in this classroom. The list has been refreshed.';
    if (error.status === 409 && /inactive classroom/i.test(message)) return 'This classroom is no longer active, so quizzes can’t be published. A school administrator can reactivate it.';
    if (error.status === 409 && /QuestionVersions/i.test(message)) return 'Some of this quiz’s questions are no longer published, so it can’t be published. Ask the course author to publish them again.';
    if (error.status === 409) return 'This quiz can’t be published from its current status. The list has been refreshed.';
  }
  if (error.status === 404) return 'VISTA couldn’t find what this page asked for. Refresh the page; if it continues, ask your VISTA administrator.';
  if (error.status >= 500) return action === 'load' ? 'Quizzes couldn’t be loaded because of a problem on VISTA’s side. Try again.' : 'VISTA couldn’t save this because of a problem on its side. Try again.';
  return message || 'Something went wrong. Try again.';
}
