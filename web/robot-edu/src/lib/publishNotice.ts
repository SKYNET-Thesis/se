import type { ApiCourse } from './api';

/** Publishing is all-or-nothing on the server, so a success response means the enrollments were synchronized too. */
export function publishNotice(course: Pick<ApiCourse, 'enrollmentSync'>, subject = 'Course'): string {
  const sync = course.enrollmentSync;
  if (!sync || sync.classrooms === 0) return `${subject} published. No active classroom is using it yet.`;
  return `${subject} published. ${sync.enrolled} student enrollment${sync.enrolled === 1 ? '' : 's'} synchronized across ${sync.classrooms} classroom${sync.classrooms === 1 ? '' : 's'}.`;
}
