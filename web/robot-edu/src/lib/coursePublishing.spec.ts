import { describe, expect, it } from 'vitest';
import { canPublishCourses, PUBLISH_DENIED_MESSAGE } from './coursePublishing';

describe('course publishing policy (UI hint; the API is authoritative)', () => {
  it('lets Instructors and System Administrators publish', () => {
    expect(canPublishCourses('teacher')).toBe(true);
    expect(canPublishCourses('admin')).toBe(true);
  });
  it('does not offer publishing to a School Administrator, and says why', () => {
    expect(canPublishCourses('school_admin')).toBe(false);
    expect(PUBLISH_DENIED_MESSAGE).toMatch(/Instructor/);
  });
});
