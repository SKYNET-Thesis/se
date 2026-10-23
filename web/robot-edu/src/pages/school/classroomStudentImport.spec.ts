import { describe, expect, it } from 'vitest';
import { classroomImportResultSummary, classroomPreviewSummary, toClassroomStudentRows } from './classroomStudentImport';

describe('classroom student import view model', () => {
  it('sends only normalized Student contract fields and never preview status or classroom role', () => {
    const rows = toClassroomStudentRows([{ row: 2, firstName: ' Bao ', lastName: ' Ngoc ', fullName: 'Bao Ngoc', email: '', studentCode: ' S001 ', gradeLevel: ' Grade 3 ', guardianEmail: ' PARENT@EXAMPLE.COM ', errors: [] }]);
    expect(rows).toEqual([{ firstName: 'Bao', lastName: 'Ngoc', studentCode: 'S001', gradeLevel: 'Grade 3', email: undefined, guardianEmail: 'parent@example.com' }]);
    expect(rows[0]).not.toHaveProperty('status');
    expect(rows[0]).not.toHaveProperty('classroomRole');
  });

  it('maps preview classifications to school-facing metrics', () => {
    expect(classroomPreviewSummary({ processed: 4, newStudents: 1, existingStudents: 1, alreadyInClass: 1, needsReview: 1, rows: [] })).toEqual([
      ['Records', 4], ['New students', 1], ['Existing students', 1], ['Already in classroom', 1], ['Needs review', 1],
    ]);
  });

  it('maps persisted result states without claiming failed rows succeeded', () => {
    expect(classroomImportResultSummary({ processed: 4, createdAndAdded: 1, existingAdded: 1, unchanged: 1, failed: 1, results: [] })).toEqual([
      ['Processed', 4], ['Created and added', 1], ['Existing added', 1], ['Already in classroom', 1], ['Failed', 1],
    ]);
  });
});
