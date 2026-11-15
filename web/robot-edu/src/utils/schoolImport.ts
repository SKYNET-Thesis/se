import { csvSyntaxMessage, isBlankRecord, readCsv } from './csv';

export type ImportKind = 'teachers' | 'students';
export type ImportStatus = 'Ready' | 'Duplicate' | 'Needs review';
export type ImportRow = { row:number; firstName:string; lastName:string; fullName:string; email:string; employeeCode?:string; studentCode?:string; gradeLevel?:string; guardianEmail?:string; errors:string[] };
const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function template(kind: ImportKind) { return kind === 'teachers' ? 'first_name,last_name,email,employee_code\nNguyen,Van A,teacher@school.edu,GV001\n' : 'first_name,last_name,student_code,grade_level,email,guardian_email\nLe,Van B,HS001,Grade 3,,parent@school.edu\n'; }
export const requiredColumns = (kind: ImportKind) => (kind === 'teachers' ? ['first_name', 'last_name', 'email', 'employee_code'] : ['first_name', 'last_name', 'student_code', 'grade_level']);

/** Message used on rows whose value count differs from the header; exported so callers can recognise them. */
export const columnCountMessage = (found: number, expected: number) => `This row has ${found} values but the header has ${expected} columns, so its values can’t be matched to columns. Check for a missing value or a comma outside quotation marks.`;

export type SchoolCsvFile =
  | { ok: true; rows: ImportRow[]; misalignedRows: number[] }
  | { ok: false; kind: 'syntax' | 'empty' | 'missing-columns' | 'duplicate-columns'; message: string; columns?: string[] };

/**
 * Reads a school import file with the RFC 4180 reader (quoted values, `""`, CRLF/LF/CR, BOM, line breaks inside quotes).
 * Blank rows are skipped. `row` is the record's position among the non-blank rows plus 2 (the header is row 1), which is
 * also how the server numbers the rows it is sent, so preview and results line up. A row whose value count differs from
 * the header is never mapped to columns: its fields stay empty and it carries `columnCountMessage`, so it can't pass as
 * valid data. Trailing empty values beyond the header are accepted.
 */
export function readSchoolCsv(kind: ImportKind, source: string): SchoolCsvFile {
  const parsed = readCsv(source);
  if (!parsed.ok) return { ok: false, kind: 'syntax', message: csvSyntaxMessage(parsed.error) };
  const records = parsed.records.filter((record) => !isBlankRecord(record));
  if (records.length === 0) return { ok: false, kind: 'empty', message: 'This file is empty. Choose a CSV with a header row and one person per row.' };
  const headers = records[0].cells.map((value) => value.trim());
  const duplicated = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicated.length) return { ok: false, kind: 'duplicate-columns', columns: [...new Set(duplicated)], message: `The header lists ${[...new Set(duplicated)].join(', ')} more than once. Keep one column for each.` };
  const missing = requiredColumns(kind).filter((column) => !headers.includes(column));
  if (missing.length) return { ok: false, kind: 'missing-columns', columns: missing, message: `Missing required CSV columns: ${missing.join(', ')}.` };

  const emails = new Set<string>(); const codes = new Set<string>(); const misalignedRows: number[] = [];
  const rows = records.slice(1).map((record, index) => {
    const row = index + 2;
    const cells = record.cells.length > headers.length && record.cells.slice(headers.length).every((cell) => cell.trim() === '') ? record.cells.slice(0, headers.length) : record.cells;
    if (cells.length !== headers.length) {
      misalignedRows.push(row);
      return { row, firstName: '', lastName: '', fullName: '', email: '', errors: [columnCountMessage(cells.length, headers.length)] } satisfies ImportRow;
    }
    const value = (header: string) => (cells[headers.indexOf(header)] ?? '').trim();
    const firstName = value('first_name'), lastName = value('last_name'), email = value('email').toLowerCase(), code = kind === 'teachers' ? value('employee_code') : value('student_code'), gradeLevel = value('grade_level'), guardianEmail = value('guardian_email').toLowerCase(), errors: string[] = [];
    if(!firstName)errors.push('First name is required.'); if(!lastName)errors.push('Last name is required.'); if(kind==='teachers'&&(!email||!valid.test(email)))errors.push('Email is required and must be valid.'); if(kind==='teachers'&&!code)errors.push('Employee code is required.'); if(kind==='students'&&!code)errors.push('Student code is required.'); if(kind==='students'&&!gradeLevel)errors.push('Grade level is required.'); if(kind==='students'&&email&&!valid.test(email))errors.push('Email is malformed.'); if(kind==='students'&&guardianEmail&&!valid.test(guardianEmail))errors.push('Guardian email is malformed.'); if(code&&codes.has(code))errors.push(`Duplicate ${kind==='teachers'?'employee':'student'} code in upload.`); if(code)codes.add(code); if(email&&emails.has(email))errors.push('Duplicate email in upload.'); if(email)emails.add(email);
    return { row, firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email, employeeCode: kind === 'teachers' ? code : undefined, studentCode: kind === 'students' ? code : undefined, gradeLevel, guardianEmail, errors } satisfies ImportRow;
  });
  return { ok: true, rows, misalignedRows };
}

/**
 * Row list for School Import (unchanged signature). A file that can't be read becomes one row carrying the reason, which
 * the review shows as "Needs review" and which blocks Confirm, as before.
 */
export function parseSchoolCsv(kind: ImportKind | string, source?: string): ImportRow[] {
  if (source === undefined) { source = kind as string; kind = 'teachers'; }
  const file = readSchoolCsv(kind as ImportKind, source);
  return file.ok ? file.rows : [{ row: 1, firstName: '', lastName: '', fullName: '', email: '', errors: [file.message] }];
}
export function rowStatus(row:ImportRow):ImportStatus{return row.errors.some(error=>error.startsWith('Duplicate'))?'Duplicate':row.errors.length?'Needs review':'Ready';}
export function importSummary(rows:ImportRow[]){return rows.reduce((summary,row)=>{summary[rowStatus(row)]++;return summary;},{Records:rows.length,Ready:0,Duplicate:0,'Needs review':0} as Record<'Records'|ImportStatus,number>);}
export function filterImportRows(rows:ImportRow[],status:'All'|ImportStatus,query:string){const needle=query.trim().toLowerCase();return rows.filter(row=>(status==='All'||rowStatus(row)===status)&&(!needle||[row.fullName,row.email,row.employeeCode,row.studentCode,row.gradeLevel,row.guardianEmail].some(value=>value?.toLowerCase().includes(needle))));}
