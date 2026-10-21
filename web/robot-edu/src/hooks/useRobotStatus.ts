import { useCallback, useEffect, useState } from 'react';
import type { RobotStatus } from '../types/robot';
import { realRobotAdapter, simulationAdapter } from '../utils/robot/adapters';

interface RobotStatusState {
  loading: boolean;
  simulation: RobotStatus | null;
  hardware: RobotStatus | null;
  error: string | null;
}

export function useRobotStatus() {
  const [state, setState] = useState<RobotStatusState>({ loading: true, simulation: null, hardware: null, error: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [simulation, hardware] = await Promise.all([simulationAdapter.getStatus(), realRobotAdapter.getStatus()]);
      setState({ loading: false, simulation, hardware, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Status check failed' }));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, refresh };
}