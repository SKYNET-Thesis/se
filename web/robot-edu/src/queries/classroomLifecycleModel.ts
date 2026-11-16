import { ApiError, type ApiOffering, type ApiRecord, type ApiSchoolClassroom } from '../lib/api';

/**
 * A03 classroom lifecycle (change course, archive, reactivate). Rules follow EducationAdminService:
 * - PUT …/classrooms/:id/offering needs `education.classroom.manage`; 409 when the classroom is archived; 404 unless
 *   the offering is the school's, active, and its course is a published global (VISTA catalog) course. Changing the
 *   offering releases this classroom's enrollments and re-enrolls its students when the new course is deliverable.
 * - POST …/archive is idempotent and returns `releasedEnrollments`; membership and learning records are kept.
 * - POST …/reactivate accepts archived, completed or active classrooms (409 otherwise) and returns
 *   `restoredEnrollments`: students only regain access when the classroom's offering and course are deliverable.
 */
export type LifecycleKind = 'archive' | 'reactivate' | 'change-course';

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
const countFrom = (response: unknown, key: string) => {
  const value = (response as ApiRecord | null | undefined)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/** 404 and 409 mean the screen no longer matches the server (removed, archived elsewhere, offering stopped). */
export const isStaleLifecycleError = (error: unknown) => error instanceof ApiError && (error.status === 404 || error.status === 409);

/**
 * The server refused the chosen offering itself ("An active offering for a published global course was not found.").
 * Only that 404 means the course is ineligible: "Classroom was not found." and a route 404 ("Cannot PUT …/offering") do
 * not, and neither do network errors or 5xx.
 */
export const isRefusedOfferingError = (error: unknown) => error instanceof ApiError && error.status === 404 && /\boffering\b.*\bnot found\b/i.test(error.message);

export function lifecycleErrorMessage(error: unknown, kind: LifecycleKind): string {
  const verb = kind === 'archive' ? 'archived' : kind === 'reactivate' ? 'reactivated' : 'changed';
  if (error instanceof TypeError) return 'VISTA couldn’t be reached. Check your connection, then try again.';
  if (!(error instanceof ApiError)) return error instanceof Error && error.message ? error.message : `The ${kind === 'change-course' ? 'course' : 'classroom'} couldn’t be ${verb}. Try again.`;
  if (error.status === 401) return 'Your session has ended. Sign in again, then try again.';
  if (error.status === 403) return 'Your account isn’t allowed to manage classrooms in this school.';
  if (kind === 'change-course' && isRefusedOfferingError(error)) {
    return 'This course can’t be assigned. Only VISTA catalog courses your school is running can be used. Choose another course.';
  }
  if (error.status === 404) return 'This classroom wasn’t found. It may have been removed, so the list has been refreshed.';
  if (kind === 'change-course' && error.status === 409) return 'This classroom has been archived, so its course can’t be changed. Reactivate it first.';
  if (kind === 'reactivate' && error.status === 409) return 'This classroom can’t be reactivated from its current status. The list has been refreshed.';
  return error.message || `The ${kind === 'change-course' ? 'course' : 'classroom'} couldn’t be ${verb}. Try again.`;
}

/**
 * Success message from what the server reports. Counts are shown only when the response includes them; a reactivation
 * that restored no access for a classroom with students says so instead of implying everyone is back.
 */
export function lifecycleOutcome(kind: 'archive' | 'reactivate', response: unknown, classroom: Pick<ApiSchoolClassroom, 'name' | 'student_count'>): { title: string; description: string } {
  if (kind === 'archive') {
    const released = countFrom(response, 'releasedEnrollments');
    return { title: `${classroom.name} archived`, description: released ? `Course access ended for ${plural(released, 'student')} in this classroom. Their work is kept.` : 'Students keep their work. You can reactivate the classroom later.' };
  }
  const restored = countFrom(response, 'restoredEnrollments');
  if (restored) return { title: `${classroom.name} reactivated`, description: `Course access is back for ${plural(restored, 'student')}.` };
  if (restored === 0 && classroom.student_count > 0) return { title: `${classroom.name} reactivated`, description: 'No course access was restored. Check that the classroom’s course is still running.' };
  return { title: `${classroom.name} reactivated`, description: 'You can change its course and manage it as before.' };
}

/** The classroom's current offering, if the school's offering list includes it. */
export const currentOffering = (offerings: ApiOffering[] | undefined, offeringId: string | null | undefined) => offerings?.find((offering) => offering.id === offeringId) ?? null;

/** Offerings the dialog can offer: active and not the current one. The server still decides catalog eligibility. */
export const selectableOfferings = (offerings: ApiOffering[] | undefined, offeringId: string | null | undefined) =>
  (offerings ?? []).filter((offering) => offering.status === 'active' && offering.id !== offeringId);
