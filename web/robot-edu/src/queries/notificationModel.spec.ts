import { describe, expect, it } from 'vitest';
import type { ApiInstructorSubmission, ApiMyLearning } from '../lib/api';
import { studentNotifications, teacherNotifications } from './notificationModel';

const learning = (status: string, id: string) => ({ classroom_assignment_id: id, title: `T-${id}`, classroom_name: 'Robotics Class A', status }) as unknown as ApiMyLearning;
const sub = (over: Partial<ApiInstructorSubmission>) => ({ id: 's', assignment_id: 'a', learner_user_id: 'u', status: 'submitted', submitted_at: null, review_status: 'unreviewed', ...over }) as ApiInstructorSubmission;

describe('notification summaries use only real actionable work', () => {
  it('counts a student’s assigned and in-progress work, not submitted or evaluated', () => {
    const summary = studentNotifications([learning('assigned', '1'), learning('in_progress', '2'), learning('submitted', '3'), learning('evaluated', '4')]);
    expect(summary.count).toBe(2); expect(summary.items.map((item) => item.to)).toEqual(['/my-learning/1', '/my-learning/2']);
  });
  it('is empty — not fabricated — without data', () => {
    expect(studentNotifications(undefined).count).toBe(0); expect(teacherNotifications([], []).items).toEqual([]);
  });
  it('counts only submissions still awaiting assessment per classroom', () => {
    const summary = teacherNotifications([{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }], [[sub({}), sub({ review_status: 'assessed' }), sub({})], [sub({ grading_released_at: 'x' })]]);
    expect(summary.count).toBe(2); expect(summary.items).toEqual([{ id: 'c1', title: '2 submissions awaiting review', detail: 'A', to: '/teacher/submissions?classroomId=c1' }]);
  });
});
