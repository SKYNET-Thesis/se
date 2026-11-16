import type { ApiCourse } from './api';

/** Only report enrollment synchronization when the API explicitly confirms it. */
export function publishNotice(course: Pick<ApiCourse, 'enrollmentSync'>, subject = 'Course'): string {
  const sync = course.enrollmentSync;
  if (!sync) return `${subject} published. Enrollment synchronization was not confirmed; check classroom enrollment before delivery.`;
  if (sync.classrooms === 0) return `${subject} published. No active classroom is using it yet.`;
  return `${subject} published. ${sync.enrolled} student enrollment${sync.enrolled === 1 ? '' : 's'} synchronized across ${sync.classrooms} classroom${sync.classrooms === 1 ? '' : 's'}.`;
}
