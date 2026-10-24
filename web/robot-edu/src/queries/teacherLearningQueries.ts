export const teacherLearningKeys = {
  root: ['teacher-learning'] as const,
  classroom: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId] as const,
  roster: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'roster'] as const,
  assignments: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'assignments'] as const,
  deliveryOptions: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'delivery-options'] as const,
  submissions: (classroomId: string) => ['teacher-learning', 'classrooms', classroomId, 'submissions'] as const,
  submission: (submissionId:string) => ['teacher-learning','submissions',submissionId] as const,
};

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

export const canPublishAssignment = (status: string) => status === 'draft';
