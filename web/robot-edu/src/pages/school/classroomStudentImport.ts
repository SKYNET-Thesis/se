import { readSchoolCsv, type ImportRow } from '../../utils/schoolImport';

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

/** Columns the classroom student import reads (utils/schoolImport `readSchoolCsv('students')`). */
export const STUDENT_CSV_COLUMNS = { required: ['first_name', 'last_name', 'student_code', 'grade_level'], optional: ['email', 'guardian_email'] } as const;

/** ImportClassroomStudentsDto: @ArrayMaxSize(500). */
export const MAX_IMPORT_ROWS = 500;

const rowList = (rows: number[]) => `${rows.length === 1 ? 'row' : 'rows'} ${rows.length > 5 ? `${rows.slice(0, 5).join(', ')} and ${rows.length - 5} more` : rows.join(', ')}`;

/**
 * Reads the classroom student file with the shared RFC 4180 reader and stops before anything is sent when the file
 * can't be read exactly: CSV syntax errors, an empty file, missing or repeated columns, no student rows, more rows than
 * the request accepts, or any row whose value count differs from the header. The server only checks values, so a row
 * read into the wrong columns could pass it; such rows are refused here instead of being skipped silently.
 */
export function readStudentCsv(source: string): { ok: true; rows: ImportRow[] } | { ok: false; message: string } {
  const file = readSchoolCsv('students', source);
  if (!file.ok) {
    if (file.kind === 'missing-columns' && file.columns) return { ok: false, message: `This file is missing ${file.columns.length === 1 ? 'a required column' : 'required columns'}: ${file.columns.join(', ')}. Download the template to see the expected header.` };
    if (file.kind === 'empty') return { ok: false, message: 'This file is empty. Choose a CSV with a header row and one student per row.' };
    return { ok: false, message: file.message };
  }
  if (file.rows.length === 0) return { ok: false, message: 'This file has a header but no students. Add one student per row and try again.' };
  if (file.rows.length > MAX_IMPORT_ROWS) return { ok: false, message: `This file has ${file.rows.length} students. Import up to ${MAX_IMPORT_ROWS} at a time by splitting it into smaller files.` };
  if (file.misalignedRows.length) {
    const rows = file.misalignedRows;
    return { ok: false, message: `${rowList(rows).replace(/^r/, 'R')} ${rows.length === 1 ? 'doesn’t' : 'don’t'} match the header’s columns. Check for a missing value or a comma outside quotation marks, then choose the file again.` };
  }
  return { ok: true, rows: file.rows };
}

export type PreviewGroup = 'add' | 'already' | 'fix';
export const previewGroup = (status: ClassroomStudentPreviewRow['status']): PreviewGroup => (status === 'needs_review' ? 'fix' : status === 'already_in_class' ? 'already' : 'add');
export const PREVIEW_FILTERS: Array<{ value: 'all' | PreviewGroup; label: string }> = [
  { value: 'all', label: 'All rows' }, { value: 'add', label: 'Will be added' }, { value: 'already', label: 'Already in classroom' }, { value: 'fix', label: 'Needs fixing' },
];
/**
 * Review filters worth showing: All always, plus each group that has rows in the server's preview. A group with no rows
 * has nothing to show, so its chip is hidden; "Needs fixing" therefore appears whenever any row needs fixing.
 */
export function availablePreviewFilters(counts: Record<'all' | PreviewGroup, number>) {
  return PREVIEW_FILTERS.filter((item) => item.value === 'all' || counts[item.value] > 0);
}

export const previewStatusLabel = (status: ClassroomStudentPreviewRow['status']) =>
  status === 'new_student' ? 'New to school' : status === 'existing_student' ? 'In your school' : status === 'already_in_class' ? 'Already in classroom' : 'Needs fixing';

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
