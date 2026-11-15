import type { ImportRow } from '../../utils/schoolImport';

export interface ClassroomStudentPreview {
  processed: number;
  newStudents: number;
  existingStudents: number;
  alreadyInClass: number;
  needsReview: number;
  rows: ClassroomStudentPreviewRow[];
}
export interface ClassroomStudentPreviewRow {
  row: number;
  firstName: string;
  lastName: string;
  studentCode: string;
  gradeLevel: string;
  email: string | null;
  status: 'new_student' | 'existing_student' | 'already_in_class' | 'needs_review';
  errors: string[];
  warnings: string[];
}

export interface ClassroomStudentImportResult {
  processed: number;
  createdAndAdded: number;
  existingAdded: number;
  unchanged: number;
  failed: number;
  results: Array<{ row: number; status: 'created_and_added' | 'existing_added' | 'unchanged' | 'failed'; code?: string; message?: string; name: string; studentCode?: string }>;
}

export function toClassroomStudentRows(rows: ImportRow[]) {
  return rows.map(row => ({
    firstName: row.firstName.trim(),
    lastName: row.lastName.trim(),
    studentCode: row.studentCode?.trim(),
    gradeLevel: row.gradeLevel?.trim(),
    email: row.email.trim().toLowerCase() || undefined,
    guardianEmail: row.guardianEmail?.trim().toLowerCase() || undefined,
  }));
}

/** Columns the classroom student import reads (utils/schoolImport `parseSchoolCsv('students')`). */
export const STUDENT_CSV_COLUMNS = { required: ['first_name', 'last_name', 'student_code', 'grade_level'], optional: ['email', 'guardian_email'] } as const;

export type StudentCsvProblem =
  | { kind: 'empty' } | { kind: 'missing-columns'; columns: string[] } | { kind: 'no-rows' } | { kind: 'too-many'; rows: number }
  | { kind: 'quoted-values'; rows: number[] } | { kind: 'column-count'; rows: number[]; columns: number };

/**
 * File-level problems, checked before anything is sent. Uses the same splitting rules as parseSchoolCsv so the two
 * never disagree.
 *
 * The shared parser splits every line on commas and does not understand CSV quoting, so `"Nguyen, Van",An,…` would be
 * read as shifted columns and could import a wrong name, code or grade without any error. Until that parser supports
 * quoting, this import refuses (a) any quotation mark, which is how spreadsheets wrap values containing commas, and
 * (b) any row whose number of values differs from the header's, since a bare comma inside a value always adds one.
 * Spreadsheet exports write every column on every row, so valid files pass. Either way the whole file is stopped with
 * the row numbers before anything reaches the preview or the server.
 *
 * Residual case: a hand-written row that both omits a column and contains a bare comma keeps the right count. Only
 * proper CSV quoting support in parseSchoolCsv removes it; until then it is a known limitation.
 */
export function studentCsvProblem(source: string): StudentCsvProblem | null {
  const lines = source.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return { kind: 'empty' };
  const headers = lines[0].split(',').map((value) => value.trim());
  const missing = STUDENT_CSV_COLUMNS.required.filter((column) => !headers.includes(column));
  if (missing.length) return { kind: 'missing-columns', columns: missing };
  if (lines.length === 1) return { kind: 'no-rows' };
  if (lines.length - 1 > MAX_IMPORT_ROWS) return { kind: 'too-many', rows: lines.length - 1 };
  const fileRow = (index: number) => index + 1; // line 1 is the header, as in the preview's row numbers
  const quoted = lines.map((line, index) => (line.includes('"') ? fileRow(index) : 0)).filter(Boolean);
  if (quoted.length) return { kind: 'quoted-values', rows: quoted };
  const misaligned = lines.slice(1).map((line, index) => (line.split(',').length !== headers.length ? fileRow(index + 1) : 0)).filter(Boolean);
  if (misaligned.length) return { kind: 'column-count', rows: misaligned, columns: headers.length };
  return null;
}

const rowList = (rows: number[]) => `${rows.length === 1 ? 'row' : 'rows'} ${rows.length > 5 ? `${rows.slice(0, 5).join(', ')} and ${rows.length - 5} more` : rows.join(', ')}`;

/** ImportClassroomStudentsDto: @ArrayMaxSize(500). */
export const MAX_IMPORT_ROWS = 500;

export function csvProblemMessage(problem: StudentCsvProblem) {
  switch (problem.kind) {
    case 'empty': return 'This file is empty. Choose a CSV with a header row and one student per row.';
    case 'missing-columns': return `This file is missing ${problem.columns.length === 1 ? 'a required column' : 'required columns'}: ${problem.columns.join(', ')}. Download the template to see the expected header.`;
    case 'no-rows': return 'This file has a header but no students. Add one student per row and try again.';
    case 'too-many': return `This file has ${problem.rows} students. Import up to ${MAX_IMPORT_ROWS} at a time by splitting it into smaller files.`;
    case 'quoted-values': return `Quotation marks aren’t supported yet (${rowList(problem.rows)}). Spreadsheets add them around values that contain commas. Remove the commas and quotation marks from those values, then choose the file again.`;
    case 'column-count': return `${rowList(problem.rows).replace(/^r/, 'R')} ${problem.rows.length === 1 ? 'doesn’t' : 'don’t'} have ${problem.columns} values like the header. Usually a value contains a comma or a column is missing. Fix ${problem.rows.length === 1 ? 'it' : 'them'}, then choose the file again.`;
  }
}

export type PreviewGroup = 'add' | 'already' | 'fix';
export const previewGroup = (status: ClassroomStudentPreviewRow['status']): PreviewGroup => (status === 'needs_review' ? 'fix' : status === 'already_in_class' ? 'already' : 'add');
export const PREVIEW_FILTERS: Array<{ value: 'all' | PreviewGroup; label: string }> = [
  { value: 'all', label: 'All rows' }, { value: 'add', label: 'Will be added' }, { value: 'already', label: 'Already in class' }, { value: 'fix', label: 'Needs fixing' },
];
export const previewStatusLabel = (status: ClassroomStudentPreviewRow['status']) =>
  status === 'new_student' ? 'New to school' : status === 'existing_student' ? 'In your school' : status === 'already_in_class' ? 'Already in class' : 'Needs fixing';

/**
 * Rows the confirm request will add. The service processes every row: rows with errors fail on their own and the
 * rest are still added, so a file with some problems can be imported once at least one row is addable.
 */
export const importableCount = (preview: Pick<ClassroomStudentPreview, 'newStudents' | 'existingStudents'>) => preview.newStudents + preview.existingStudents;
export const addedCount = (result: Pick<ClassroomStudentImportResult, 'createdAndAdded' | 'existingAdded'>) => result.createdAndAdded + result.existingAdded;

const csvCell = (value: string | number | undefined) => { const textValue = String(value ?? ''); return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue; };

/** The server's per-row failures as a CSV the admin can fix and re-import. */
export function failedRowsCsv(results: ClassroomStudentImportResult['results']) {
  const failed = results.filter((item) => item.status === 'failed');
  return ['row,name,student_code,reason', ...failed.map((item) => [item.row, item.name, item.studentCode, item.message ?? 'This row could not be imported.'].map(csvCell).join(','))].join('\n') + '\n';
}
