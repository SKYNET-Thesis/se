import { randomUUID } from 'node:crypto';

/**
 * Object-key layout of the single Learning Media bucket (S3 "prefixes" are key conventions, not folders):
 *
 *   learning-media/courses/<courseId>/{documents|images|videos|audio}/<mediaId><ext>   course media (D02, this module)
 *   learning-media/submissions/<assignmentId>/<studentId>/<attemptId>/<fileId><ext>   student attachments (D03, SubmissionFileStorage only)
 *   (the "submission" segment is the immutable attempt id: one attempt = one submission unit)
 *
 * Keys are always built on the server from UUIDs and a fixed allowlist; a client never supplies any part of a key.
 */
export const COURSE_MEDIA_PREFIX = 'learning-media/courses/';
/** Student submissions (D03). Course-media code must never read or write below it; only SubmissionFileStorage may. */
export const SUBMISSIONS_PREFIX = 'learning-media/submissions/';

export const MEDIA_CATEGORIES = ['documents', 'images', 'videos', 'audio'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const COURSE_KEY = new RegExp(`^${COURSE_MEDIA_PREFIX}(${UUID})/(${MEDIA_CATEGORIES.join('|')})/(${UUID})(\\.[a-z0-9]{2,5})$`);

export function courseMediaKey(courseId: string, category: MediaCategory, mediaId: string, extension: string): string {
  const key = `${COURSE_MEDIA_PREFIX}${courseId}/${category}/${mediaId}${extension}`;
  if (!COURSE_KEY.test(key)) throw new Error('Refusing to build a malformed Learning Media key.');
  return key;
}

export const newMediaId = (): string => randomUUID();

/** True only for a well-formed course-media key. Anything else (traversal, submissions prefix, other prefixes) is rejected. */
export function isCourseMediaKey(key: string): boolean {
  return typeof key === 'string' && COURSE_KEY.test(key);
}

/** The course a well-formed key belongs to, or null. */
export function courseIdOfKey(key: string): string | null {
  return COURSE_KEY.exec(key)?.[1] ?? null;
}

/** Extensions a student attachment key may carry (the allowlist lives in submission-file.validation.ts). */
const SUBMISSION_EXTENSIONS = ['pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'] as const;
const SUBMISSION_KEY = new RegExp(`^${SUBMISSIONS_PREFIX}(${UUID})/(${UUID})/(${UUID})/(${UUID})(\\.(?:${SUBMISSION_EXTENSIONS.join('|')}))$`);

export type SubmissionKeyParts = { assignmentId: string; studentId: string; attemptId: string; fileId: string; extension: string };

/** Builds a student attachment key from server-held UUIDs only; a client never supplies any part of it. */
export function submissionFileKey(assignmentId: string, studentId: string, attemptId: string, fileId: string, extension: string): string {
  const key = `${SUBMISSIONS_PREFIX}${assignmentId}/${studentId}/${attemptId}/${fileId}${extension}`;
  if (!SUBMISSION_KEY.test(key)) throw new Error('Refusing to build a malformed submission file key.');
  return key;
}

export function parseSubmissionKey(key: string): SubmissionKeyParts | null {
  if (typeof key !== 'string') return null;
  const match = SUBMISSION_KEY.exec(key);
  return match ? { assignmentId: match[1], studentId: match[2], attemptId: match[3], fileId: match[4], extension: match[5] } : null;
}

export const isSubmissionKey = (key: string): boolean => parseSubmissionKey(key) !== null;
