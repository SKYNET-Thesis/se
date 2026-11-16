import { describe, expect, it } from 'vitest';
import { template } from '../../utils/schoolImport';
import { addedCount, availablePreviewFilters, failedRowsCsv, importableCount, previewGroup, readStudentCsv, toClassroomStudentRows } from './classroomStudentImport';

describe('classroom student import view model', () => {
  it('sends only normalized Student contract fields and never preview status or classroom role', () => {
    const rows = toClassroomStudentRows([{ row: 2, firstName: ' Bao ', lastName: ' Ngoc ', fullName: 'Bao Ngoc', email: '', studentCode: ' S001 ', gradeLevel: ' Grade 3 ', guardianEmail: ' PARENT@EXAMPLE.COM ', errors: [] }]);
    expect(rows).toEqual([{ firstName: 'Bao', lastName: 'Ngoc', studentCode: 'S001', gradeLevel: 'Grade 3', email: undefined, guardianEmail: 'parent@example.com' }]);
    expect(rows[0]).not.toHaveProperty('status');
    expect(rows[0]).not.toHaveProperty('classroomRole');
  });

  it('reports file-level problems before anything is sent, including the 500-row request limit', () => {
    const message = (source: string) => { const result = readStudentCsv(source); return result.ok ? null : result.message; };
    expect(message('')).toContain('This file is empty');
    expect(message('first_name,last_name\nAn,Le')).toContain('missing required columns: student_code, grade_level');
    expect(message('first_name,last_name,student_code,grade_level\n\n,,,\n')).toContain('has a header but no students');
    const big = ['first_name,last_name,student_code,grade_level', ...Array.from({ length: 501 }, (_, i) => `A,B,S${i},8`)].join('\n');
    expect(message(big)).toContain('This file has 501 students');
    expect(message('first_name,last_name,student_code,grade_level\n"Nguyen, An,S1,8')).toContain('never closed');
    expect(message('first_name,first_name,last_name,student_code,grade_level\nA,B,C,S1,8')).toContain('more than once');
  });

  it('reads quoted values exactly, including commas, doubled quotes and CRLF line endings', () => {
    const header = 'first_name,last_name,student_code,grade_level,email,guardian_email';
    const result = readStudentCsv(`${header}\r\n"Nguyen, Van",An,S2,Grade 8,,\r\nLe,"Han ""Bee""",S3,"Grade 8, room B2",han@example.test,\r\n`);
    expect(result.ok && result.rows.map(({ row, firstName, lastName, studentCode, gradeLevel, email }) => ({ row, firstName, lastName, studentCode, gradeLevel, email }))).toEqual([
      { row: 2, firstName: 'Nguyen, Van', lastName: 'An', studentCode: 'S2', gradeLevel: 'Grade 8', email: '' },
      { row: 3, firstName: 'Le', lastName: 'Han "Bee"', studentCode: 'S3', gradeLevel: 'Grade 8, room B2', email: 'han@example.test' },
    ]);
  });

  it('refuses rows that can’t be matched to columns instead of importing shifted values', () => {
    const four = 'first_name,last_name,student_code,grade_level';
    // A bare comma outside quotes adds a value; without this check "Van" would be read as the last name.
    const shifted = readStudentCsv(`${four}\nAn,Le,S1,8\nNguyen, Van,An,S2,8\nBao,Tran,S3`);
    expect(shifted).toEqual({ ok: false, message: 'Rows 3, 4 don’t match the header’s columns. Check for a missing value or a comma outside quotation marks, then choose the file again.' });
    // Extra empty values at the end of a row are harmless and accepted.
    expect(readStudentCsv(`${four}\nAn,Le,S1,8,,`).ok).toBe(true);
  });

  it('accepts the downloadable student template and a spreadsheet byte-order mark', () => {
    expect(readStudentCsv(template('students')).ok).toBe(true);
    expect(readStudentCsv(String.fromCharCode(0xfeff) + 'first_name,last_name,student_code,grade_level\nAn,Le,S1,8').ok).toBe(true);
  });

  it('offers All plus only the review groups that have rows', () => {
    const labels = (counts: { all: number; add: number; already: number; fix: number }) => availablePreviewFilters(counts).map((item) => item.value);
    expect(labels({ all: 8, add: 4, already: 1, fix: 3 })).toEqual(['all', 'add', 'already', 'fix']);
    expect(labels({ all: 2, add: 2, already: 0, fix: 0 })).toEqual(['all', 'add']);
    expect(labels({ all: 3, add: 0, already: 0, fix: 3 })).toEqual(['all', 'fix']); // rows needing fixing are always reachable
  });

  it('counts only rows the service will add, and groups preview statuses for review', () => {
    expect(importableCount({ newStudents: 2, existingStudents: 3 })).toBe(5);
    expect(addedCount({ createdAndAdded: 1, existingAdded: 4 })).toBe(5);
    expect(['new_student', 'existing_student', 'already_in_class', 'needs_review'].map((status) => previewGroup(status as never))).toEqual(['add', 'add', 'already', 'fix']);
  });

  it('exports the server’s failed rows as CSV without claiming the rest failed', () => {
    const csv = failedRowsCsv([
      { row: 2, status: 'created_and_added', name: 'An Le', studentCode: 'S1' },
      { row: 3, status: 'failed', name: 'Bao, Tran', studentCode: 'S2', message: 'Student code is required.' },
      { row: 4, status: 'failed', name: 'Chi "C" Pham' },
    ]);
    expect(csv).toBe('row,name,student_code,reason\n3,"Bao, Tran",S2,Student code is required.\n4,"Chi ""C"" Pham",,This row could not be imported.\n');
  });
});
