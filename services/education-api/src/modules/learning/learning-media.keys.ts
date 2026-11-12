import { randomUUID } from 'node:crypto';

/**
 * Object-key layout of the single Learning Media bucket (S3 "prefixes" are key conventions, not folders):
 *
 *   learning-media/courses/<courseId>/{documents|images|videos|audio}/<mediaId><ext>   course media (D02, this module)
 *   learning-media/submissions/<assignmentId>/<studentId>/<submissionId>/...           RESERVED for D03, never issued here
 *
 * Keys are always built on the server from UUIDs and a fixed allowlist; a client never supplies any part of a key.
 */
export const COURSE_MEDIA_PREFIX = 'learning-media/courses/';
/** Reserved for student submissions (D03). Course-media code must never read or write below it. */
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
