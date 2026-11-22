import type { ApiOffering, ApiOrganizationMembership } from '../../lib/api';

/**
 * Who can see and create the offerings of one course, and for which school. The server stays authoritative (every call is checked
 * against the caller's membership and permission); this only decides what to show.
 *  - School Administrator: their own school. A school-owned course of another school is not theirs to offer.
 *  - System Administrator: the course's own school for a school-owned course; any school they manage for a global course.
 *  - Everyone else (instructors, students): nothing, offerings are managed by administrators.
 */
export type OfferingScope =
  | { kind: 'school'; organizationId: string; canCreate: boolean }
  | { kind: 'choose-school' }
  | { kind: 'hidden' }
  | { kind: 'foreign-school' };

export function offeringScope(input: { role: string | null | undefined; memberships: ApiOrganizationMembership[]; courseOrganizationId: string | null | undefined }): OfferingScope {
  const { role, memberships, courseOrganizationId } = input;
  if (role === 'admin') return courseOrganizationId ? { kind: 'school', organizationId: courseOrganizationId, canCreate: true } : { kind: 'choose-school' };
  if (role !== 'school_admin') return { kind: 'hidden' };
  const own = memberships.find((item) => item.roleCode === 'school_admin' && item.status === 'active');
  if (!own) return { kind: 'hidden' };
  if (courseOrganizationId && courseOrganizationId !== own.organizationId) return { kind: 'foreign-school' };
  return { kind: 'school', organizationId: own.organizationId, canCreate: own.permissionCodes ? own.permissionCodes.includes('education.classroom.manage') : true };
}

/** The offerings of this one course, newest first as the API returns them. */
export const offeringsOfCourse = (offerings: ApiOffering[] | undefined, courseId: string) => (offerings ?? []).filter((item) => item.courseId === courseId);

export const canCreateOffering = (courseStatus: string | undefined) => courseStatus === 'published';

export const offeringTermLabel = (offering: Pick<ApiOffering, 'academicTerm' | 'academicYear'>) =>
  [offering.academicTerm?.trim(), offering.academicYear ? String(offering.academicYear) : ''].filter(Boolean).join(' ') || 'No term set';
