import { describe, expect, it } from 'vitest';
import type { ApiClassroomAssignment, ApiInstructorSubmission } from '../lib/api';
import { buildAssignmentRows, canEditAssignment, canPublishAssignment, canViewSubmissions, emptyFilters, filterAssignmentRows, paginate, pageWindow, sortAssignmentRows } from './teacherAssignmentsModel';

const assignment = (over: Partial<ApiClassroomAssignment>): ApiClassroomAssignment => ({ id: 'ca-1', classroom_id: 'c1', assignment_id: 'a1', lesson_id: 'l1', lesson_title: 'Open & Close Gripper', challenge_id: null, challenge_title: 'Gripper Sequence Challenge', title: 'D03 Test', instructions: null, status: 'published', ...over });
const submission = (over: Partial<ApiInstructorSubmission>): ApiInstructorSubmission => ({ id: 's', assignment_id: 'a1', learner_user_id: 'u', status: 'submitted', submitted_at: null, review_status: 'unreviewed', ...over });
const room = { id: 'c1', name: 'Robotics Class A', student_count: 12 };

describe('buildAssignmentRows', () => {
  it('derives counts only from returned submissions of the same assignment', () => {
    const rows = buildAssignmentRows([{ classroom: room, assignments: [assignment({}), assignment({ id: 'ca-2', assignment_id: 'a2', title: 'Other' })], courseByLesson: { l1: 'Robotics Fundamentals' },
      submissions: [submission({ id: '1' }), submission({ id: '2', review_status: 'assessed' }), submission({ id: '3', assignment_id: 'a2' })] }]);
    expect(rows[0]).toMatchObject({ assignedStudents: 12, submitted: 2, assessed: 1, needsReview: 1, courseTitle: 'Robotics Fundamentals' });
    expect(rows[1]).toMatchObject({ submitted: 1, assessed: 0, needsReview: 1 });
  });

  it('reports unknown counts as null instead of inventing zeros when submissions are unavailable', () => {
    const [row] = buildAssignmentRows([{ classroom: room, assignments: [assignment({})] }]);
    expect(row.submitted).toBeNull(); expect(row.assessed).toBeNull(); expect(row.needsReview).toBeNull();
  });
});

describe('filter, sort and paginate', () => {
  const rows = buildAssignmentRows([
    { classroom: room, assignments: [assignment({ id: 'x1', assignment_id: 'a1', title: 'Zeta', status: 'draft' }), assignment({ id: 'x2', assignment_id: 'a2', title: 'alpha', status: 'published', due_at: '2026-12-01T00:00:00Z' })], submissions: [submission({ assignment_id: 'a2' })], courseByLesson: { l1: 'Robotics' } },
    { classroom: { id: 'c2', name: 'Class B', student_count: 3 }, assignments: [assignment({ id: 'x3', classroom_id: 'c2', assignment_id: 'a3', title: 'Beta', status: 'closed', lesson_id: 'l9', lesson_title: 'Other lesson' })] },
  ]);
  it('filters by search, classroom, lesson and status', () => {
    expect(filterAssignmentRows(rows, { ...emptyFilters, search: 'ALP' }).map((r) => r.title)).toEqual(['alpha']);
    expect(filterAssignmentRows(rows, { ...emptyFilters, classroomId: 'c2' }).map((r) => r.title)).toEqual(['Beta']);
    expect(filterAssignmentRows(rows, { ...emptyFilters, lessonId: 'l9' }).map((r) => r.title)).toEqual(['Beta']);
    expect(filterAssignmentRows(rows, { ...emptyFilters, status: 'draft' }).map((r) => r.title)).toEqual(['Zeta']);
    expect(filterAssignmentRows(rows, { ...emptyFilters, course: 'Robotics' })).toHaveLength(2);
  });
  it('sorts by title, status, needs review and due date', () => {
    expect(sortAssignmentRows(rows, 'title').map((r) => r.title)).toEqual(['alpha', 'Beta', 'Zeta']);
    expect(sortAssignmentRows(rows, 'status').map((r) => r.status)).toEqual(['draft', 'published', 'closed']);
    expect(sortAssignmentRows(rows, 'needs-review')[0].title).toBe('alpha');
    expect(sortAssignmentRows(rows, 'due')[0].title).toBe('alpha');
  });
  it('paginates and clamps the page', () => {
    const page = paginate([1, 2, 3, 4, 5], 9, 2);
    expect(page).toMatchObject({ page: 3, pageCount: 3, items: [5], from: 5, to: 5, total: 5 });
    expect(paginate([], 1, 10)).toMatchObject({ pageCount: 1, items: [], from: 0, to: 0 });
    expect(pageWindow(5, 9)).toEqual([1, '…', 4, 5, 6, '…', 9]);
  });
});

describe('row capabilities follow the API lifecycle', () => {
  it('only drafts are editable/publishable; drafts have no submissions to view', () => {
    expect(canEditAssignment('draft')).toBe(true); expect(canEditAssignment('published')).toBe(false); expect(canEditAssignment('closed')).toBe(false);
    expect(canPublishAssignment('draft')).toBe(true); expect(canPublishAssignment('published')).toBe(false);
    expect(canViewSubmissions('draft')).toBe(false); expect(canViewSubmissions('published')).toBe(true);
  });
});

describe('enrolled count', () => {
  it('uses active enrollments, not raw membership, and falls back on an older API', () => {
    const base = { classroom: { id: 'c1', name: 'A', student_count: 5, enrolled_student_count: 3 }, assignments: [assignment({})] };
    expect(buildAssignmentRows([base])[0].assignedStudents).toBe(3);
    expect(buildAssignmentRows([{ ...base, classroom: { id: 'c1', name: 'A', student_count: 5 } }])[0].assignedStudents).toBe(5);
    expect(buildAssignmentRows([{ ...base, classroom: { id: 'c1', name: 'A', student_count: 5, enrolled_student_count: 0 } }])[0].assignedStudents).toBe(0);
  });
});
