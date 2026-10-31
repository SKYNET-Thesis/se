import type { ApiAttempt } from '../lib/api';

export const studentLearningKeys = {
  all: ['student-learning'] as const,
  list: (userId = '', sessionRevision = 0) => [...studentLearningKeys.all, 'list', userId, sessionRevision] as const,
  assignment: (classroomAssignmentId:string) => [...studentLearningKeys.all, 'assignment', classroomAssignmentId] as const,
  attempts: (classroomAssignmentId:string) => [...studentLearningKeys.assignment(classroomAssignmentId), 'attempts'] as const,
  practice: (attemptId:string) => [...studentLearningKeys.all, 'practice', attemptId] as const,
  coursePaths: (userId = '', sessionRevision = 0) => [...studentLearningKeys.all, 'course-paths', userId, sessionRevision] as const,
  coursePath: (courseId = '', userId = '', sessionRevision = 0) => [...studentLearningKeys.all, 'course-path', courseId, userId, sessionRevision] as const,
  lessonDetail: (lessonId = '', userId = '', sessionRevision = 0) => [...studentLearningKeys.all, 'lesson-detail', lessonId, userId, sessionRevision] as const,
};

export function nextAttemptAction(attempt: Pick<ApiAttempt,'id'|'status'>|null): {kind:'continue';attemptId:string}|{kind:'start'} {
  return attempt?.status === 'in_progress' ? { kind:'continue', attemptId:attempt.id } : { kind:'start' };
}
export const allowsPhysicalExecution = (mode:'learning'|'physical-enabled') => mode === 'physical-enabled';
