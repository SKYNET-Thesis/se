import type { Role } from '../types/user';
import { useRole } from '../contexts/RoleContext';

/** Owner policy: Instructors (teacher role) and System Administrators publish courses; School Administrators author but do not publish. */
export const canPublishCourses = (role: Role | null | undefined): boolean => role !== 'school_admin';
export const PUBLISH_DENIED_MESSAGE = 'Only an Instructor can publish a course. Ask an Instructor to publish it.';
/**
 * UI hint only; the API refuses publishing for anyone without learning.course.publish. Outside a RoleProvider (isolated component tests)
 * the hint defaults to "allowed" rather than throwing; useRole's context read happens before it throws, so hook order is unchanged.
 */
export function useCanPublishCourses(): boolean {
  try { return canPublishCourses(useRole().role); } catch { return true; }
}
