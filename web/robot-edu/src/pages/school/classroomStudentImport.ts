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

export function classroomPreviewSummary(preview: Pick<ClassroomStudentPreview, 'processed' | 'newStudents' | 'existingStudents' | 'alreadyInClass' | 'needsReview'>) {
  return [['Records', preview.processed], ['New students', preview.newStudents], ['Existing students', preview.existingStudents], ['Already in classroom', preview.alreadyInClass], ['Needs review', preview.needsReview]] as Array<[string, number]>;
}

export function classroomImportResultSummary(result: Pick<ClassroomStudentImportResult, 'processed' | 'createdAndAdded' | 'existingAdded' | 'unchanged' | 'failed'>) {
  return [['Processed', result.processed], ['Created and added', result.createdAndAdded], ['Existing added', result.existingAdded], ['Already in classroom', result.unchanged], ['Failed', result.failed]] as Array<[string, number]>;
}
