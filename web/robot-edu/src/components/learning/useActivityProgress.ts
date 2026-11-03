import { useQuery } from '@tanstack/react-query';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { progressionApi } from '../../lib/api';
import { studentLearningKeys } from '../../queries/studentLearningQueries';

export function useActivityProgress(courseId: string) {
  const { session, sessionRevision } = useSupabaseSession();
  const canVerify = Boolean(courseId && session?.access_token);
  const query = useQuery({
    queryKey: studentLearningKeys.activityProgress(courseId, session?.user?.id, sessionRevision),
    queryFn: () => progressionApi.activityProgress(courseId, session?.access_token ?? ''),
    enabled: canVerify,
    staleTime: 30_000,
  });
  return { ...query, canVerify };
}
