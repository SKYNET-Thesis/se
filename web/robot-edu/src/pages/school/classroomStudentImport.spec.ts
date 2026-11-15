import { describe, expect, it } from 'vitest';
import { template } from '../../utils/schoolImport';
import { addedCount, csvProblemMessage, failedRowsCsv, importableCount, previewGroup, studentCsvProblem, toClassroomStudentRows } from './classroomStudentImport';

describe('classroom student import view model', () => {
  it('sends only normalized Student contract fields and never preview status or classroom role', () => {
    const rows = toClassroomStudentRows([{ row: 2, firstName: ' Bao ', lastName: ' Ngoc ', fullName: 'Bao Ngoc', email: '', studentCode: ' S001 ', gradeLevel: ' Grade 3 ', guardianEmail: ' PARENT@EXAMPLE.COM ', errors: [] }]);
    expect(rows).toEqual([{ firstName: 'Bao', lastName: 'Ngoc', studentCode: 'S001', gradeLevel: 'Grade 3', email: undefined, guardianEmail: 'parent@example.com' }]);
    expect(rows[0]).not.toHaveProperty('status');
    expect(rows[0]).not.toHaveProperty('classroomRole');
  });

  it('reports file-level problems before anything is sent, including the 500-row request limit', () => {
    expect(studentCsvProblem('')).toEqual({ kind: 'empty' });
    expect(studentCsvProblem('first_name,last_name\nAn,Le')).toEqual({ kind: 'missing-columns', columns: ['student_code', 'grade_level'] });
    expect(studentCsvProblem('first_name,last_name,student_code,grade_level\n')).toEqual({ kind: 'no-rows' });
    const big = ['first_name,last_name,student_code,grade_level', ...Array.from({ length: 501 }, (_, i) => `A,B,S${i},8`)].join('\n');
    expect(studentCsvProblem(big)).toEqual({ kind: 'too-many', rows: 501 });
    expect(studentCsvProblem('first_name,last_name,student_code,grade_level\nAn,Le,S1,8')).toBeNull();
    expect(csvProblemMessage({ kind: 'missing-columns', columns: ['grade_level'] })).toContain('missing a required column: grade_level');
  });

  it('refuses files the comma-splitting parser would read as shifted columns, so no misaligned data is imported', () => {
    const header = 'first_name,last_name,student_code,grade_level,email,guardian_email';
    // A spreadsheet wraps a value containing a comma in quotes; split on commas it would shift every later column.
    expect(studentCsvProblem(`${header}\nAn,Le,S1,8,,\n"Nguyen, Van",An,S2,8,,\nBao,Tran,S3,8,,`)).toEqual({ kind: 'quoted-values', rows: [3] });
    expect(studentCsvProblem(`${header}\n"An",Le,S1,8,,`)).toEqual({ kind: 'quoted-values', rows: [2] });
    // A bare comma always changes the value count, even when the shifted cell is empty.
    const four = 'first_name,last_name,student_code,grade_level';
    expect(studentCsvProblem(`${four}\nAn,Le,S1,8\nNguyen, Van,An,S2,8`)).toEqual({ kind: 'column-count', rows: [3], columns: 4 });
    expect(studentCsvProblem(`${four}\nNguyen, Van,An,S2,`)).toEqual({ kind: 'column-count', rows: [2], columns: 4 }); // otherwise 4 plausible, wrong values
    expect(studentCsvProblem(`${header}\nAn,Le,S1,8,,,\nBao,Tran,S2,8`)).toEqual({ kind: 'column-count', rows: [2, 3], columns: 6 });
    // Spreadsheet exports keep every column, including empty optional ones, and pass.
    expect(studentCsvProblem(`${header}\nAn,Le,S1,8,,\nBao,Tran,S2,8,bao@example.test,`)).toBeNull();
    expect(csvProblemMessage({ kind: 'quoted-values', rows: [3] })).toContain('(row 3)');
    expect(csvProblemMessage({ kind: 'column-count', rows: [3, 4, 5, 6, 7, 8, 9], columns: 6 })).toBe('Rows 3, 4, 5, 6, 7 and 2 more don’t have 6 values like the header. Usually a value contains a comma or a column is missing. Fix them, then choose the file again.');
  });

  it('accepts the downloadable student template as is', () => {
    expect(studentCsvProblem(template('students'))).toBeNull();
  });

  it('accepts a spreadsheet byte-order mark before the header (trim removes it, as in parseSchoolCsv)', () => {
    const withMark = String.fromCharCode(0xfeff) + 'first_name,last_name,student_code,grade_level\nAn,Le,S1,8';
    expect(studentCsvProblem(withMark)).toBeNull();
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
