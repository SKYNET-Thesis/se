import { describe, expect, it } from 'vitest';
import { filterImportRows, importSummary, parseSchoolCsv, rowStatus, template } from './schoolImport';

describe('school CSV import', () => {
  it('has approved templates', () => {
    expect(template('teachers')).toContain('first_name,last_name,email,employee_code');
    expect(template('students')).toContain('first_name,last_name,student_code,grade_level,email,guardian_email');
    expect(template('students')).toContain('HS001,Grade 3,,parent@school.edu');
  });

  it('reads both downloadable templates as ready rows with the corrected parser', () => {
    for (const kind of ['teachers', 'students'] as const) {
      const rows = parseSchoolCsv(kind, template(kind));
      expect(rows).toHaveLength(1);
      expect(rowStatus(rows[0])).toBe('Ready');
    }
  });

  it('allows primary-school students with blank optional emails', () => {
    const rows = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level,email,guardian_email\nLe,Han,S1,Grade 3,,\nMai,An,S2,Grade 3,,');
    expect(rows.every(row => rowStatus(row) === 'Ready')).toBe(true);
  });

  it('validates optional emails, student codes, and grade levels', () => {
    const rows = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level,email,guardian_email\nA,B,S1,3,bad,guardian\nC,D,S1,3,a@x.com,\nE,F,S2,3,a@x.com,\nG,H,,,,');
    expect(rows[0].errors.join()).toContain('Email is malformed');
    expect(rows[0].errors.join()).toContain('Guardian email is malformed');
    expect(rows[1].errors.join()).toContain('Duplicate student code');
    expect(rows[2].errors.join()).toContain('Duplicate email');
    expect(rows[3].errors.join()).toContain('Student code is required');
    expect(rows[3].errors.join()).toContain('Grade level is required');
  });

  it('classifies review rows and filters by status or searchable data', () => {
    const rows = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level,email,guardian_email\nLe,Han,S1,Grade 3,,\nMai,An,S1,Grade 4,,\nBao,An,S2,Grade 5,bad,');
    expect(importSummary(rows)).toEqual({ Records: 3, Ready: 1, Duplicate: 1, 'Needs review': 1 });
    expect(rowStatus(rows[1])).toBe('Duplicate');
    expect(rowStatus(rows[2])).toBe('Needs review');
    expect(filterImportRows(rows, 'Duplicate', '')).toHaveLength(1);
    expect(filterImportRows(rows, 'All', 'grade 3')).toHaveLength(1);
    expect(filterImportRows(rows, 'All', 'S2')).toHaveLength(1);
  });

  it('reads quoted values for School Import without shifting columns', () => {
    const rows = parseSchoolCsv('teachers', 'first_name,last_name,email,employee_code\r\n"Nguyen, Van",An,an@school.edu,GV001\r\nLe,"Han ""Bee""",han@school.edu,GV002\r\n');
    expect(rows.map(row => [row.firstName, row.lastName, row.email, row.employeeCode, rowStatus(row)])).toEqual([
      ['Nguyen, Van', 'An', 'an@school.edu', 'GV001', 'Ready'],
      ['Le', 'Han "Bee"', 'han@school.edu', 'GV002', 'Ready'],
    ]);
  });

  it('keeps a misaligned row out of the Ready set instead of reading shifted values', () => {
    const rows = parseSchoolCsv('teachers', 'first_name,last_name,email,employee_code\nNguyen, Van,An,an@school.edu,GV001\nLe,Han,han@school.edu,GV002');
    expect(rows[0]).toMatchObject({ row: 2, firstName: '', email: '' });
    expect(rows[0].employeeCode).toBeUndefined();
    expect(rows[0].errors[0]).toContain('has 5 values but the header has 4 columns');
    expect(rowStatus(rows[0])).toBe('Needs review');
    expect(rowStatus(rows[1])).toBe('Ready');
    expect(importSummary(rows)).toEqual({ Records: 2, Ready: 1, Duplicate: 0, 'Needs review': 1 });
  });

  it('turns an unreadable file into one row that blocks import, as before', () => {
    expect(parseSchoolCsv('students', 'first_name,last_name\nA,B')[0].errors[0]).toContain('Missing required CSV columns');
    const broken = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level\n"A,B,S1,3');
    expect(broken).toHaveLength(1);
    expect(rowStatus(broken[0])).toBe('Needs review');
    expect(broken[0].errors[0]).toContain('never closed');
  });

  it('skips blank rows and keeps row numbers in step with what is sent to the server', () => {
    const rows = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level\n\nLe,Han,S1,3\n,,,\nMai,An,S2,3\n');
    expect(rows.map(row => [row.row, row.studentCode])).toEqual([[2, 'S1'], [3, 'S2']]);
  });
});
