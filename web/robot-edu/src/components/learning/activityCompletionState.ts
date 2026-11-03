import type { LessonProgressStatus } from '../../lib/api';

export type ActivityCompletionState = 'incomplete' | 'completed' | 'locked' | 'checking';

/** Only IDs supplied by an authoritative activity-completion response may produce a tick. */
export function activityCompletionState(
  activityId: string,
  evidence: {
    completedActivityIds?: readonly string[];
    locked?: boolean;
    lessonStatus?: LessonProgressStatus;
    visitedActivityIds?: readonly string[];
  } = {},
): ActivityCompletionState {
  if (evidence.locked || evidence.lessonStatus === 'locked') return 'locked';
  return evidence.completedActivityIds?.includes(activityId) ? 'completed' : 'incomplete';
}
