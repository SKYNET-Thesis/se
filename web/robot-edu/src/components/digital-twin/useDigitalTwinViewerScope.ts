import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, digitalTwinApi, type DigitalTwinViewerScope } from '../../lib/api';

type ScopeState = { scope: DigitalTwinViewerScope | null; status: 'loading' | 'authorized' | 'unavailable' | 'error'; message: string | null };

export function useDigitalTwinViewerScope(accessToken: string | undefined, selectedRobotId: string | undefined) {
  const [state, setState] = useState<ScopeState>({ scope: null, status: 'loading', message: null });
  const [requestNonce, setRequestNonce] = useState(0);
  const selection = useRef({ accessToken, robotId: selectedRobotId, generation: 0 });
  if (selection.current.accessToken !== accessToken || selection.current.robotId !== selectedRobotId) {
    selection.current = { accessToken, robotId: selectedRobotId, generation: selection.current.generation + 1 };
  }
  const renderGeneration = selection.current.generation;
  const refresh = useCallback(() => setRequestNonce(value => value + 1), []);
  useEffect(() => {
    let active = true;
    const generation = renderGeneration;
    if (selection.current.generation !== generation) return () => { active = false; };
    if (!accessToken) { setState({ scope: null, status: 'unavailable', message: 'Sign in to request physical telemetry.' }); return () => { active = false; }; }
    if (!selectedRobotId) { setState({ scope: null, status: 'unavailable', message: 'Select an authorized robot to request physical telemetry.' }); return () => { active = false; }; }
    setState({ scope: null, status: 'loading', message: null });
    void digitalTwinApi.viewerScope(selectedRobotId, accessToken).then(scope => {
      if (active && selection.current.generation === generation) setState({ scope, status: 'authorized', message: null });
    }).catch(error => {
      if (!active || selection.current.generation !== generation) return;
      if (error instanceof ApiError && [400, 403, 404].includes(error.status)) setState({ scope: null, status: 'unavailable', message: 'Physical telemetry is not authorized for this robot.' });
      else setState({ scope: null, status: 'error', message: error instanceof Error ? error.message : 'Could not request Digital Twin telemetry.' });
    });
    return () => { active = false; };
  }, [accessToken, selectedRobotId, requestNonce, renderGeneration]);
  useEffect(() => {
    if (!state.scope) return;
    const timer = window.setTimeout(refresh, Math.max(0, Date.parse(state.scope.expiresAt) - Date.now() - 5_000));
    return () => window.clearTimeout(timer);
  }, [refresh, state.scope]);
  return { ...state, refresh };
}
