import { ApiError } from '../lib/api';

/**
 * How a failed learning request is explained to a student. A failure is never shown as an empty list, and raw server text is never shown.
 *  - network: the request never reached the API (offline, DNS, CORS): retry can help.
 *  - session: 401, the sign-in expired: retrying cannot help, signing in again does.
 *  - permission: 403, this account may not see it: retrying cannot help.
 *  - server: 5xx or anything else: retry may help.
 */
export type LearningLoadFailure = { kind: 'network' | 'session' | 'permission' | 'server'; message: string; canRetry: boolean };

export function describeLearningLoadFailure(reason: unknown, subject = 'Your courses'): LearningLoadFailure {
  if (reason instanceof ApiError) {
    if (reason.status === 401) return { kind: 'session', message: 'Your session has expired. Sign in again to see your learning.', canRetry: false };
    if (reason.status === 403) return { kind: 'permission', message: `Your account isn’t allowed to see ${subject.toLowerCase()}. Ask your school administrator if you think this is a mistake.`, canRetry: false };
    return { kind: 'server', message: `${subject} couldn’t be loaded. Try again in a moment.`, canRetry: true };
  }
  if (reason instanceof TypeError || (reason instanceof Error && /failed to fetch|networkerror|load failed|network request failed/i.test(reason.message))) {
    return { kind: 'network', message: 'VISTA couldn’t be reached. Check your connection and try again.', canRetry: true };
  }
  return { kind: 'server', message: `${subject} couldn’t be loaded. Try again in a moment.`, canRetry: true };
}
