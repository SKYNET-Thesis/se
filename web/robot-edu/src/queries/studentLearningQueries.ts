import type { ApiAttempt } from '../lib/api';

export const studentLearningKeys = {
  all: ['student-learning'] as const,
  list: () => [...studentLearningKeys.all, 'list'] as const,
  assignment: (classroomAssignmentId:string) => [...studentLearningKeys.all, 'assignment', classroomAssignmentId] as const,
  attempts: (classroomAssignmentId:string) => [...studentLearningKeys.assignment(classroomAssignmentId), 'attempts'] as const,
  practice: (attemptId:string) => [...studentLearningKeys.all, 'practice', attemptId] as const,
};

export function nextAttemptAction(attempt: Pick<ApiAttempt,'id'|'status'>|null): {kind:'continue';attemptId:string}|{kind:'start'} {
  return attempt?.status === 'in_progress' ? { kind:'continue', attemptId:attempt.id } : { kind:'start' };
}
export const allowsPhysicalExecution = (mode:'learning'|'physical-enabled') => mode === 'physical-enabled';
