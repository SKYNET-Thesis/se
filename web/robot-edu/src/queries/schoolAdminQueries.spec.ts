import { describe, expect, it } from 'vitest';
import { classroomStudentImportInvalidations, eligibleRobotsEnabled, importInvalidations, memberInvalidations, robotInvalidations, schoolAdminEnabledQueries, schoolAdminKeys } from './schoolAdminQueries';

describe('School Admin query scoping', () => {
  it('scopes People keys by organization and filters', () => {
    expect(schoolAdminKeys.people('org-a', { page: 1, pageSize: 20, search: '', role: 'all' })).not.toEqual(
      schoolAdminKeys.people('org-b', { page: 1, pageSize: 20, search: '', role: 'all' }),
    );
    expect(schoolAdminKeys.people('org-a', { page: 1, pageSize: 20, search: 'bao', role: 'student' })).not.toEqual(
      schoolAdminKeys.people('org-a', { page: 1, pageSize: 20, search: '', role: 'all' }),
    );
  });

  it('scopes roster and candidate keys by organization and classroom', () => {
    expect(schoolAdminKeys.members('org-a', 'class-a')).not.toEqual(schoolAdminKeys.members('org-a', 'class-b'));
    expect(schoolAdminKeys.candidates('org-a', 'class-a', { page: 1, pageSize: 20, search: '' })).not.toEqual(
      schoolAdminKeys.candidates('org-b', 'class-a', { page: 1, pageSize: 20, search: '' }),
    );
  });

  it('invalidates only import-related reads after import', () => {
    expect(importInvalidations('org-a')).toEqual([schoolAdminKeys.peopleRoot('org-a'), schoolAdminKeys.overview('org-a')]);
  });

  it('invalidates only roster, candidates, and classroom summaries after add member', () => {
    expect(memberInvalidations('org-a', 'class-a')).toEqual([
      schoolAdminKeys.members('org-a', 'class-a'),
      schoolAdminKeys.candidatesRoot('org-a', 'class-a'),
      schoolAdminKeys.classrooms('org-a'),
    ]);
  });

  it('does not invalidate People or offerings after Robot allocation', () => {
    const keys = robotInvalidations('org-a', 'class-a');
    expect(keys).toEqual([schoolAdminKeys.classrooms('org-a'), schoolAdminKeys.robotResource('org-a', 'class-a')]);
    expect(keys).not.toContainEqual(schoolAdminKeys.peopleRoot('org-a'));
    expect(keys).not.toContainEqual(schoolAdminKeys.offerings('org-a'));
  });

  it('invalidates only People, Overview, and the selected classroom after classroom student import', () => {
    expect(classroomStudentImportInvalidations('org-a', 'class-a')).toEqual([
      schoolAdminKeys.peopleRoot('org-a'),
      schoolAdminKeys.overview('org-a'),
      schoolAdminKeys.members('org-a', 'class-a'),
      schoolAdminKeys.candidatesRoot('org-a', 'class-a'),
      schoolAdminKeys.classrooms('org-a'),
    ]);
  });
});

describe('School Admin lazy query enablement', () => {
  it('loads only overview aggregate on Overview', () => expect(schoolAdminEnabledQueries({ tab: 'overview', organizationId: 'org-a' })).toEqual({ overview: true, people: false, classrooms: false, roster: false, offerings: false, candidates: false }));
  it('loads only People on People', () => expect(schoolAdminEnabledQueries({ tab: 'users', organizationId: 'org-a' })).toEqual({ overview: false, people: true, classrooms: false, roster: false, offerings: false, candidates: false }));
  it('loads offerings only when Create Classroom is open', () => {
    expect(schoolAdminEnabledQueries({ tab: 'classrooms', organizationId: 'org-a', createOpen: false }).offerings).toBe(false);
    expect(schoolAdminEnabledQueries({ tab: 'classrooms', organizationId: 'org-a', createOpen: true }).offerings).toBe(true);
  });
  it('loads roster only for a selected classroom and candidates only for Add Member', () => {
    expect(schoolAdminEnabledQueries({ tab: 'classrooms', organizationId: 'org-a', selectedClassroomId: 'class-a', memberOpen: false })).toMatchObject({ classrooms: true, roster: true, candidates: false });
    expect(schoolAdminEnabledQueries({ tab: 'classrooms', organizationId: 'org-a', selectedClassroomId: 'class-a', memberOpen: true })).toMatchObject({ roster: true, candidates: true });
  });
  it('loads eligible Robots only while Allocate or Replace is open', () => {
    expect(eligibleRobotsEnabled(false, 'class-a')).toBe(false);
    expect(eligibleRobotsEnabled(true, '')).toBe(false);
    expect(eligibleRobotsEnabled(true, 'class-a')).toBe(true);
  });
});
