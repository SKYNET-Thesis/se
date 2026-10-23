import { describe, expect, it } from 'vitest';
import { filterImportRows, importSummary, parseSchoolCsv, rowStatus, template } from './schoolImport';

describe('school CSV import', () => {
  it('has approved templates', () => {
    expect(template('teachers')).toContain('first_name,last_name,email,employee_code');
    expect(template('students')).toContain('first_name,last_name,student_code,grade_level,email,guardian_email');
    expect(template('students')).toContain('HS001,Grade 3,,parent@school.edu');
  });

  it('allows primary-school students with blank optional emails', () => {
    const rows = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level,email,guardian_email\nLe,Han,S1,Grade 3,,\nMai,An,S2,Grade 3,,');
    expect(rows.every(row => rowStatus(row) === 'Ready')).toBe(true);
  });

  it('validates optional emails, student codes, and grade levels', () => {
    const rows = parseSchoolCsv('students', 'first_name,last_name,student_code,grade_level,email,guardian_email\nA,B,S1,3,bad,guardian\nC,D,S1,3,a@x.com,\nE,F,S2,3,a@x.com,\nG,H,,,');
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
});
