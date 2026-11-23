import { describe, expect, it } from 'vitest';
import { canCreateOffering, offeringScope, offeringsOfCourse, offeringTermLabel } from './courseOfferingsModel';

const membership = (organizationId: string, roleCode = 'school_admin', permissionCodes?: string[]) => ({ organizationId, roleCode, status: 'active', permissionCodes });

describe('offeringScope', () => {
  it('lets a School Administrator manage offerings for their own school, for a global or their own school-owned course', () => {
    expect(offeringScope({ role: 'school_admin', memberships: [membership('s1')], courseOrganizationId: null })).toEqual({ kind: 'school', organizationId: 's1', canCreate: true });
    expect(offeringScope({ role: 'school_admin', memberships: [membership('s1')], courseOrganizationId: 's1' })).toEqual({ kind: 'school', organizationId: 's1', canCreate: true });
  });
  it('does not offer another school\'s school-owned course', () => {
    expect(offeringScope({ role: 'school_admin', memberships: [membership('s1')], courseOrganizationId: 's2' })).toEqual({ kind: 'foreign-school' });
  });
  it('hides create when the school administrator lacks the manage permission', () => {
    expect(offeringScope({ role: 'school_admin', memberships: [membership('s1', 'school_admin', ['education.classroom.read'])], courseOrganizationId: null })).toMatchObject({ canCreate: false });
    expect(offeringScope({ role: 'school_admin', memberships: [membership('s1', 'school_admin', ['education.classroom.manage'])], courseOrganizationId: null })).toMatchObject({ canCreate: true });
  });
  it('lets a System Administrator act for the owning school, or choose a school for a global course', () => {
    expect(offeringScope({ role: 'admin', memberships: [], courseOrganizationId: 's9' })).toEqual({ kind: 'school', organizationId: 's9', canCreate: true });
    expect(offeringScope({ role: 'admin', memberships: [], courseOrganizationId: null })).toEqual({ kind: 'choose-school' });
  });
  it('shows nothing to instructors, students, signed-out users or a school administrator without an active school', () => {
    for (const role of ['teacher', 'teaching_assistant', 'student', null, undefined]) expect(offeringScope({ role, memberships: [membership('s1', 'teacher')], courseOrganizationId: null })).toEqual({ kind: 'hidden' });
    expect(offeringScope({ role: 'school_admin', memberships: [{ organizationId: 's1', roleCode: 'school_admin', status: 'suspended' }], courseOrganizationId: null })).toEqual({ kind: 'hidden' });
  });
});

describe('offering helpers', () => {
  it('keeps only this course\'s offerings', () => {
    const all = [{ id: '1', code: 'A', title: 'A', status: 'draft', courseId: 'c1' }, { id: '2', code: 'B', title: 'B', status: 'active', courseId: 'c2' }, { id: '3', code: 'C', title: 'C', status: 'draft' }];
    expect(offeringsOfCourse(all, 'c1').map((item) => item.id)).toEqual(['1']);
    expect(offeringsOfCourse(undefined, 'c1')).toEqual([]);
  });
  it('allows creating only from a published course', () => {
    expect(canCreateOffering('published')).toBe(true);
    for (const status of ['draft', 'archived', undefined]) expect(canCreateOffering(status)).toBe(false);
  });
  it('words the term', () => {
    expect(offeringTermLabel({ academicTerm: 'Fall', academicYear: 2026 })).toBe('Fall 2026');
    expect(offeringTermLabel({ academicTerm: null, academicYear: 2026 })).toBe('2026');
    expect(offeringTermLabel({})).toBe('No term set');
  });
});
