import type { ApiInstructorSubmission, ApiMyLearning, ApiTeachingClassroom } from '../lib/api';
import { summarizeSubmissions } from './teacherSubmissionsModel';

/**
 * The platform has no notification store, so the header bell reports real, actionable work derived from existing
 * APIs. There is no read/unread state: an item disappears when the underlying work is done, never because it was
 * "dismissed", and nothing is fabricated.
 */
export interface NotificationItem { id: string; title: string; detail: string; to: string }
export interface NotificationSummary { count: number; items: NotificationItem[]; heading: string; emptyText: string }

export function studentNotifications(learning: ApiMyLearning[] | undefined): NotificationSummary {
  const open = (learning ?? []).filter((item) => item.status === 'assigned' || item.status === 'in_progress');
  return {
    count: open.length,
    heading: 'Assignments waiting for you',
    emptyText: 'You are all caught up. New classroom assignments will appear here.',
    items: open.map((item) => ({ id: item.classroom_assignment_id, title: item.title, detail: `${item.classroom_name} · ${item.status === 'assigned' ? 'New, not started' : 'In progress'}`, to: `/my-learning/${item.classroom_assignment_id}` })),
  };
}

export function teacherNotifications(rooms: Array<Pick<ApiTeachingClassroom, 'id' | 'name'>>, submissionsByRoom: Array<ApiInstructorSubmission[] | undefined>): NotificationSummary {
  const items = rooms.flatMap((room, index) => {
    const awaiting = summarizeSubmissions(submissionsByRoom[index] ?? []).awaiting;
    return awaiting > 0 ? [{ id: room.id, title: `${awaiting} submission${awaiting === 1 ? '' : 's'} awaiting review`, detail: room.name, to: `/teacher/submissions?classroomId=${room.id}` }] : [];
  });
  return {
    count: items.reduce((sum, item) => sum + Number.parseInt(item.title, 10), 0),
    heading: 'Submissions awaiting review',
    emptyText: 'No submissions are waiting for your review.',
    items,
  };
}
