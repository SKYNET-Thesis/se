import { ApiError, type ApiAttemptHistoryItem, type ApiClassroomAssignment, type ApiDraftAnswer } from '../lib/api';

/**
 * A06 student quiz rules, kept free of I/O so they can be unit tested. Every status, count and score here comes from the
 * Education API; the browser never grades, never decides availability on its own and never reconstructs answer keys.
 */

export interface QuizQuestion { questionVersionId: string; stem: string; type: string; options: Array<{ id: string; text: string }>; points?: number; ordinal?: number }
export type Selection = Record<string, string[]>;

/** Types the server issues and grades (question-bank-quiz.snapshot.ts); anything else is shown as unsupported. */
export const SUPPORTED_QUESTION_TYPES = ['single_choice', 'multiple_choice', 'true_false'] as const;
export const isSupportedQuestion = (question: QuizQuestion) => (SUPPORTED_QUESTION_TYPES as readonly string[]).includes(question.type);

export const questionHint = (type: string) => (type === 'multiple_choice' ? 'Choose all that apply.' : 'Choose one answer.');

export const isAnswered = (selection: Selection, question: QuizQuestion) => (selection[question.questionVersionId]?.length ?? 0) > 0;

export const selectionFromDraft = (draft?: ApiDraftAnswer[] | null): Selection =>
  Object.fromEntries((draft ?? []).map((answer) => [answer.questionId, answer.optionIds ?? (answer.optionId ? [answer.optionId] : [])]));

/** The exact payload shape the server grades: optionIds for multiple choice, optionId otherwise; only answered questions. */
export function answersPayload(questions: QuizQuestion[], selection: Selection): ApiDraftAnswer[] {
  return questions.filter((question) => isAnswered(selection, question)).map((question) => (question.type === 'multiple_choice'
    ? { questionId: question.questionVersionId, optionIds: selection[question.questionVersionId] }
    : { questionId: question.questionVersionId, optionId: selection[question.questionVersionId][0] }));
}

/**
 * Legacy (Course 1) knowledge checks keep their questions in the assignment and are answered inside the lesson. Question
 * Bank quizzes get a server-issued snapshot when an attempt starts.
 */
export function isLessonKnowledgeCheck(constraints: unknown): boolean {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) return false;
  const record = constraints as { kind?: unknown; questions?: unknown };
  return record.kind === 'knowledge_check' && Array.isArray(record.questions) && record.questions.length > 0;
}

export function passMarkOf(constraints: unknown): number | null {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) return null;
  const value = (constraints as { passPercent?: unknown }).passPercent;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

const dateFormat = new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const formatQuizDate = (value: string | Date) => dateFormat.format(new Date(value));

export type QuizWindow = 'scheduled' | 'open' | 'closed' | 'unpublished';

/** Mirrors startAttempt's rule: published, already available, not past close_at. A passed due date still allows work. */
export function quizWindow(assignment: Pick<ApiClassroomAssignment, 'status' | 'available_from' | 'close_at'>, now = new Date()): QuizWindow {
  if (assignment.status === 'closed' || assignment.status === 'archived') return 'closed';
  if (assignment.status !== 'published') return 'unpublished';
  if (assignment.close_at && new Date(assignment.close_at) <= now) return 'closed';
  if (assignment.available_from && new Date(assignment.available_from) > now) return 'scheduled';
  return 'open';
}

/** One sentence about when the quiz can be taken; null when there is nothing to say. */
export function windowSentence(assignment: Pick<ApiClassroomAssignment, 'status' | 'available_from' | 'due_at' | 'close_at'>, now = new Date()): string | null {
  const state = quizWindow(assignment, now);
  if (state === 'scheduled') return `Opens ${formatQuizDate(assignment.available_from as string)}.`;
  if (state === 'closed') return assignment.close_at ? `Closed ${formatQuizDate(assignment.close_at)}.` : 'This quiz is closed.';
  if (state === 'unpublished') return 'Your teacher hasn’t opened this quiz yet.';
  const closes = assignment.close_at ? formatQuizDate(assignment.close_at) : null;
  if (assignment.due_at && new Date(assignment.due_at) <= now) {
    return `Was due ${formatQuizDate(assignment.due_at)}. ${closes ? `Late answers are accepted until ${closes}.` : 'Late answers are still accepted.'}`;
  }
  if (assignment.due_at) return `Due ${formatQuizDate(assignment.due_at)}${closes ? `, closes ${closes}` : ''}.`;
  return closes ? `Closes ${closes}.` : null;
}

export type QuizAction =
  | { kind: 'continue'; attemptId: string }
  | { kind: 'start'; retake: boolean }
  | { kind: 'lesson' }
  | { kind: 'blocked'; reason: string };

/** The one primary action on the quiz page. The server still decides; a refused start is reported, never retried. */
export function quizAction(input: { window: QuizWindow; attempts: Array<Pick<ApiAttemptHistoryItem, 'id' | 'status' | 'passed'>>; maxAttempts: number | null | undefined; lessonQuiz: boolean }): QuizAction {
  if (input.lessonQuiz) return { kind: 'lesson' };
  const open = input.attempts.find((attempt) => attempt.status === 'in_progress');
  if (input.window === 'closed') return { kind: 'blocked', reason: 'This quiz is closed.' };
  if (input.window === 'unpublished') return { kind: 'blocked', reason: 'This quiz isn’t open yet.' };
  if (input.window === 'scheduled') return { kind: 'blocked', reason: 'This quiz isn’t open yet.' };
  if (open) return { kind: 'continue', attemptId: open.id };
  if (typeof input.maxAttempts === 'number' && input.attempts.length >= input.maxAttempts) return { kind: 'blocked', reason: input.maxAttempts === 1 ? 'You’ve used your only attempt.' : `You’ve used all ${input.maxAttempts} attempts.` };
  return { kind: 'start', retake: input.attempts.length > 0 };
}

/** Value shown next to the "Attempts" label, so it does not repeat the word. */
export function attemptsSentence(used: number, max: number | null | undefined): string {
  if (typeof max !== 'number') return used === 0 ? 'No limit' : `${used} used, no limit`;
  return `${used} of ${max} used`;
}

type Phase = 'load' | 'start' | 'draft' | 'submit';

/**
 * Student-facing wording for the server's answers. Codes are used where the API sends them; where it only sends a
 * status (e.g. startAttempt answers 404 for "not open", "closed", "attempts used" and "not enrolled" alike) the
 * message says what is known and nothing more.
 */
export function quizErrorMessage(error: unknown, phase: Phase): string {
  if (!(error instanceof ApiError)) {
    if (phase === 'submit') return 'We couldn’t confirm your submission because VISTA couldn’t be reached. Your answers are still here. Check your connection and try again. Your quiz is graded only once, so submitting again is safe.';
    if (phase === 'draft') return 'Your latest answers aren’t saved yet.';
    return 'VISTA couldn’t be reached. Check your connection, then try again.';
  }
  if (error.status === 401) return 'Your session has ended. Sign in again to continue.';
  if (error.code === 'ASSIGNMENT_CLOSED') return phase === 'draft' ? 'This quiz has closed, so answers can no longer be saved.' : 'This quiz closed before your answers were submitted.';
  if (error.code === 'ASSIGNMENT_NOT_AVAILABLE') return 'This quiz isn’t open right now.';
  if (error.code === 'ATTEMPT_NOT_IN_PROGRESS') return 'This attempt has already been submitted.';
  if (error.code === 'PREREQUISITE_NOT_COMPLETED') return error.message;
  if (error.status === 403) return 'Your account can’t open this quiz. Ask your teacher to check your class access.';
  if (error.status === 404) {
    if (phase === 'start') return 'This quiz can’t be started right now. It may not be open yet, it may have closed, or you may have used all your attempts.';
    if (phase === 'load') return 'This quiz isn’t available to you. It may have been closed, or your class access may have ended.';
    return 'This quiz is no longer available to you, so your answers weren’t submitted.';
  }
  if (error.status === 400 && phase === 'submit') return 'Answer every question before submitting.';
  if (error.status === 409) return phase === 'start' ? 'This quiz isn’t ready yet. Ask your teacher.' : 'This quiz couldn’t be graded. Your answers are still here. Ask your teacher if this keeps happening.';
  if (phase === 'draft') return 'Your latest answers aren’t saved yet.';
  return phase === 'submit' ? 'Your quiz couldn’t be submitted. Your answers are still here. Try again.' : 'Something went wrong on our side. Try again in a moment.';
}

/** "This completes the lesson and unlocks the next lesson." Shared by both quiz engines. */
export const lessonUnlockSentence = (unlocked: number) => `This completes the lesson${unlocked ? ` and unlocks ${unlocked === 1 ? 'the next lesson' : `${unlocked} lessons`}` : ''}.`;

/** Course 1 option ids are snake_case words ("visual_inspection"); shown as plain words with a capital first letter. */
export const legacyOptionLabel = (value: string) => { const text = value.replace(/_/g, ' ').trim(); return text.charAt(0).toUpperCase() + text.slice(1); };

/** Retrying only helps when the request may not have reached the server, or the server failed temporarily. */
export const canRetryQuiz = (error: unknown) => !(error instanceof ApiError) || error.status >= 500;
