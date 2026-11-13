import type { ApiClassroomAssignment, ApiInstructorSubmission, ApiTeachingClassroom } from '../lib/api';

/**
 * Pure view-model for the instructor Assignments table. Every number comes from an Education API response:
 * `student_count` from /me/teaching-classrooms and submission/assessment counts from /classrooms/:id/submissions.
 * Nothing is estimated; when the submissions request fails the counts are `null` and the UI shows "—".
 */
export interface AssignmentRow {
  key: string;
  classroomAssignmentId: string;
  assignmentId: string;
  classroomId: string;
  classroomName: string;
  title: string;
  challengeTitle: string | null;
  lessonId: string;
  lessonTitle: string;
  courseTitle: string;
  status: string;
  dueAt: string | null;
  createdOrder: number;
  assignedStudents: number;
  /** Submitted attempts (one final submission per attempt). */
  submitted: number | null;
  assessed: number | null;
  needsReview: number | null;
}

export interface ClassroomAssignmentsInput {
  classroom: Pick<ApiTeachingClassroom, 'id' | 'name' | 'student_count'>;
  assignments: ApiClassroomAssignment[];
  /** `undefined` when the request failed or has not resolved. */
  submissions?: ApiInstructorSubmission[];
  /** lesson id → course title from /classrooms/:id/delivery-options. */
  courseByLesson?: Record<string, string>;
}

export function buildAssignmentRows(groups: ClassroomAssignmentsInput[]): AssignmentRow[] {
  return groups.flatMap(({ classroom, assignments, submissions, courseByLesson }) => assignments.map((assignment, index) => {
    const own = submissions?.filter((item) => item.assignment_id === assignment.assignment_id);
    const assessed = own?.filter((item) => item.review_status === 'assessed').length;
    return {
      key: assignment.id ?? `${classroom.id}:${assignment.assignment_id}`,
      classroomAssignmentId: assignment.id,
      assignmentId: assignment.assignment_id,
      classroomId: classroom.id,
      classroomName: classroom.name,
      title: assignment.title,
      challengeTitle: assignment.challenge_title ?? null,
      lessonId: assignment.lesson_id ?? '',
      lessonTitle: assignment.lesson_title ?? '',
      courseTitle: courseByLesson?.[assignment.lesson_id ?? ''] ?? '',
      status: assignment.status,
      dueAt: assignment.due_at ?? null,
      createdOrder: index,
      assignedStudents: classroom.student_count ?? 0,
      submitted: own ? own.length : null,
      assessed: own ? assessed ?? 0 : null,
      needsReview: own ? own.length - (assessed ?? 0) : null,
    };
  }));
}

export type AssignmentStatusFilter = 'all' | 'draft' | 'published' | 'closed' | 'archived';
export interface AssignmentFilters { search: string; classroomId: string; course: string; lessonId: string; status: AssignmentStatusFilter }
export const emptyFilters: AssignmentFilters = { search: '', classroomId: '', course: '', lessonId: '', status: 'all' };

export function filterAssignmentRows(rows: AssignmentRow[], filters: AssignmentFilters): AssignmentRow[] {
  const needle = filters.search.trim().toLowerCase();
  return rows.filter((row) =>
    (!needle || [row.title, row.classroomName, row.lessonTitle, row.courseTitle, row.challengeTitle ?? ''].some((value) => value.toLowerCase().includes(needle))) &&
    (!filters.classroomId || row.classroomId === filters.classroomId) &&
    (!filters.course || row.courseTitle === filters.course) &&
    (!filters.lessonId || row.lessonId === filters.lessonId) &&
    (filters.status === 'all' || row.status === filters.status));
}

export type AssignmentSortKey = 'newest' | 'title' | 'status' | 'needs-review' | 'due';
export const assignmentSortOptions: Array<{ value: AssignmentSortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'status', label: 'Status' },
  { value: 'needs-review', label: 'Needs review first' },
  { value: 'due', label: 'Due date' },
];
const statusRank: Record<string, number> = { draft: 0, published: 1, closed: 2, archived: 3 };

export function sortAssignmentRows(rows: AssignmentRow[], sort: AssignmentSortKey): AssignmentRow[] {
  const copy = [...rows];
  const byTitle = (a: AssignmentRow, b: AssignmentRow) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  switch (sort) {
    case 'title': return copy.sort(byTitle);
    case 'status': return copy.sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || byTitle(a, b));
    case 'needs-review': return copy.sort((a, b) => (b.needsReview ?? -1) - (a.needsReview ?? -1) || byTitle(a, b));
    case 'due': return copy.sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || byTitle(a, b));
    default: return copy; // the API already returns newest first per classroom
  }
}

export const PAGE_SIZES = [10, 25, 50] as const;
export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  return { page: current, pageCount, total: rows.length, items: rows.slice((current - 1) * pageSize, current * pageSize), from: rows.length ? (current - 1) * pageSize + 1 : 0, to: Math.min(rows.length, current * pageSize) };
}

/** Page buttons: always first/last, the current neighbourhood and "…" gaps. */
export function pageWindow(page: number, pageCount: number): Array<number | '…'> {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((value, index) => (index > 0 && value - sorted[index - 1] > 1 ? ['…' as const, value] : [value]));
}

export const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function statusPresentation(status: string): { label: string; tone: 'ok' | 'outline' | 'neutral' | 'warn' } {
  switch (status) {
    case 'published': return { label: 'Published', tone: 'ok' };
    case 'draft': return { label: 'Draft', tone: 'outline' };
    case 'closed': return { label: 'Closed', tone: 'neutral' };
    case 'archived': return { label: 'Archived', tone: 'neutral' };
    default: return { label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown', tone: 'neutral' };
  }
}

/** Edit is only offered where the API/classroom lifecycle supports it: drafts. Published content is never edited under students. */
export const canEditAssignment = (status: string) => status === 'draft';
export const canPublishAssignment = (status: string) => status === 'draft';
export const canViewSubmissions = (status: string) => status !== 'draft';
