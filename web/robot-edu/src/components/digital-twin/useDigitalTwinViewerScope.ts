import { useCallback, useEffect, useState } from 'react';
import { ApiError, digitalTwinApi, type DigitalTwinViewerScope } from '../../lib/api';

type ScopeState = { scope: DigitalTwinViewerScope | null; status: 'loading' | 'authorized' | 'unavailable' | 'error'; message: string | null };

export function useDigitalTwinViewerScope(accessToken: string | undefined, candidateRobotIds: string[]) {
  const [state, setState] = useState<ScopeState>({ scope: null, status: 'loading', message: null });
  const acquire = useCallback(async () => {
    if (!accessToken) { setState({ scope: null, status: 'unavailable', message: 'Sign in to request physical telemetry.' }); return; }
    setState((current) => ({ ...current, status: 'loading', message: null }));
    // Robot Lab's local demo registry is not an authorization source. Only
    // persisted UUID robot IDs can be presented to the broker, which still
    // resolves allocation and organization from server-side data.
    const persistedRobotIds = candidateRobotIds.filter((robotId) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(robotId));
    for (const robotId of persistedRobotIds) {
      try {
        const scope = await digitalTwinApi.viewerScope(robotId, accessToken);
        setState({ scope, status: 'authorized', message: null });
        return;
      } catch (error) {
        if (!(error instanceof ApiError) || ![400, 403, 404].includes(error.status)) {
          setState({ scope: null, status: 'error', message: error instanceof Error ? error.message : 'Could not request Digital Twin telemetry.' });
          return;
        }
      }
    }
    setState({ scope: null, status: 'unavailable', message: 'No current robot allocation grants physical telemetry.' });
  }, [accessToken, candidateRobotIds.join('|')]);

  useEffect(() => { void acquire(); }, [acquire]);
  useEffect(() => {
    if (!state.scope) return;
    const delay = Math.max(0, Date.parse(state.scope.expiresAt) - Date.now() - 5_000);
    const timer = window.setTimeout(() => void acquire(), delay);
    return () => window.clearTimeout(timer);
  }, [acquire, state.scope]);
  return { ...state, refresh: acquire };
}
