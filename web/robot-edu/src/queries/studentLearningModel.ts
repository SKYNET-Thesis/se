import { ApiError, type CoursePathLesson, type LessonProgressStatus } from '../lib/api';
import type { BadgeTone } from '../components/ui/Badge';

/**
 * A05 student learning, following ProgressionService / LearningService (education-api):
 * - GET me/courses/:courseId/path needs an active enrollment in an active classroom of an active offering of a published
 *   course; otherwise 404 "Course was not found." (not enrolled, enrollment ended, classroom archived, course withdrawn).
 *   Lesson status, the current lesson and progressPercent are computed on the server.
 * - GET lessons/:lessonId answers 409 with the lock reason for a locked lesson and 404 when the lesson is not in the
 *   student's course path.
 * - Completion is recorded by the server from activity evidence (POST me/activities/:id/complete for reading and
 *   demonstration, attempts for quizzes and practice); moving between lessons never completes anything.
 */

/** The server's way of saying "not available to this student" (not enrolled, ended, archived, withdrawn, removed). */
export const isUnavailable = (error: unknown) => error instanceof ApiError && (error.status === 404 || error.status === 403);
export const isLockedLessonError = (error: unknown) => error instanceof ApiError && error.status === 409;

export type LearningSubject = 'courses' | 'course' | 'lesson' | 'quizzes';

export function learningErrorMessage(error: unknown, subject: LearningSubject): string {
  if (error instanceof TypeError) return 'VISTA couldn’t be reached. Check your connection, then try again.';
  if (error instanceof ApiError && error.status === 401) return 'Your session has ended. Sign in again to keep learning.';
  if (isUnavailable(error)) {
    if (subject === 'lesson') return 'This lesson isn’t available to you. It may have been removed from the course, or your access to the course has ended.';
    return 'This course isn’t available to you right now. Your class may have ended or been archived. Ask your teacher if you think this is a mistake.';
  }
  const thing = { courses: 'Your courses', course: 'This course', lesson: 'This lesson', quizzes: 'Your quizzes' }[subject];
  return `${thing} couldn’t be loaded. Try again.`;
}

/** Retrying only helps for connection and server problems, not for access or session answers. */
export const canRetry = (error: unknown) => !(error instanceof ApiError && (error.status === 401 || isUnavailable(error) || error.status === 409));

export const lessonStatusPresentation: Record<LessonProgressStatus, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Completed', tone: 'ok' },
  current: { label: 'Up next', tone: 'accent' },
  in_progress: { label: 'In progress', tone: 'accent' },
  available: { label: 'Not started', tone: 'outline' },
  locked: { label: 'Locked', tone: 'neutral' },
};

export const countLabel = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** Position of a lesson in the server's course path, with its neighbours for Previous / Next. */
export function lessonNeighbours(lessons: CoursePathLesson[] | undefined, lessonId: string) {
  const ordered = [...(lessons ?? [])].sort((a, b) => a.ordinal - b.ordinal);
  const index = ordered.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) return null;
  return { index, total: ordered.length, previous: ordered[index - 1] ?? null, next: ordered[index + 1] ?? null };
}
