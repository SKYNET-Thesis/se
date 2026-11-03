import type { ApiClassroomAssignment } from '../lib/api';

export const teacherLearningKeys = {
  root: ['teacher-learning'] as const,
  teachingClassrooms: ['teacher-learning', 'teaching-classrooms'] as const,
  classroom: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId] as const,
  roster: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'roster'] as const,
  assignments: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'assignments'] as const,
  deliveryOptions: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'delivery-options'] as const,
  submissions: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'submissions'] as const,
  submission: (submissionId:string) => ['teacher-learning','submissions',submissionId] as const,
};

export interface TeacherAssignmentRow extends ApiClassroomAssignment {
  classroomId: string;
  classroomName: string;
}

export function flattenTeacherAssignments(groups: Array<{
  classroom: { id: string; name: string };
  assignments: Array<Partial<ApiClassroomAssignment> & Pick<ApiClassroomAssignment, 'id' | 'assignment_id' | 'title' | 'status'>>;
}>): TeacherAssignmentRow[] {
  return groups.flatMap(({ classroom, assignments }) => assignments.map((assignment) => ({
    ...assignment,
    classroom_id: assignment.classroom_id ?? classroom.id,
    lesson_id: assignment.lesson_id ?? '',
    challenge_id: assignment.challenge_id ?? null,
    instructions: assignment.instructions ?? null,
    classroomId: classroom.id,
    classroomName: classroom.name,
  }))) as TeacherAssignmentRow[];
}

export const teacherLearningInvalidations = (classroomId: string) => [teacherLearningKeys.assignments(classroomId)];
export const teacherReviewInvalidations=(classroomId:string,submissionId:string)=>[teacherLearningKeys.submission(submissionId),teacherLearningKeys.submissions(classroomId)];

export interface DraftAssignmentInput {
  lessonId: string;
  challengeId: string;
  title: string;
  instructions: string;
}

export function createDraftBody(input: DraftAssignmentInput) {
  return {
    lessonId: input.lessonId,
    ...(input.challengeId ? { challengeId: input.challengeId } : {}),
    title: input.title.trim(),
    instructions: input.instructions.trim(),
  };
}

export function createUpdateBody(title: string, instructions: string) {
  return { title: title.trim(), instructions: instructions.trim() };
}

export function deliveryCourseTitle(options: Array<{ course_title: string }>) {
  return options[0]?.course_title ?? '';
}

export function teacherAssignmentEditPath(classroomId: string, assignmentId: string) {
  return `/teacher/assignments/${classroomId}/${assignmentId}/edit`;
}

export function assignmentStatusLabel(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function draftForDeliveryOption(option: { lesson_id: string; title: string; instructions: string } | undefined): DraftAssignmentInput {
  return option ? { lessonId: option.lesson_id, challengeId: '', title: option.title, instructions: option.instructions } : { lessonId: '', challengeId: '', title: '', instructions: '' };
}

export const canPublishAssignment = (status: string) => status === 'draft';
