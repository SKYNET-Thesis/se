import { useEffect, useMemo, useState } from 'react';
import { useLab } from '../contexts/LabContext';
import {
  buildAlerts,
  buildWorkflow,
  dualArmAvailability,
  getPairs,
  withSession } from
'../lib/readiness';
import type { ArmSide } from '../types';
import type { PairReadiness } from '../lib/readiness';

export function useArmPairReadiness(): Record<ArmSide, PairReadiness> {
  const { devices, session } = useLab();
  return useMemo(() => {
    const pairs = getPairs(devices);
    return { left: withSession(pairs.left, session), right: withSession(pairs.right, session) };
  }, [devices, session]);
}

export function useDualArmAvailability() {
  const { capabilities, services, estop } = useLab();
  const pairs = useArmPairReadiness();
  return useMemo(
    () => dualArmAvailability(pairs, capabilities, services, estop),
    [pairs, capabilities, services, estop]
  );
}

export function useOperationalAlerts() {
  const { devices, services, cameras, estop, capabilities } = useLab();
  const pairs = useArmPairReadiness();
  return useMemo(
    () => buildAlerts(devices, pairs, services, cameras, estop, capabilities),
    [devices, pairs, services, cameras, estop, capabilities]
  );
}

export function useWorkflowSteps() {
  const { devices, session, datasets, jobs, models } = useLab();
  const pairs = useArmPairReadiness();
  return useMemo(
    () => buildWorkflow(pairs, devices, session, datasets, jobs, models.length),
    [pairs, devices, session, datasets, jobs, models.length]
  );
}

export function useSessionClock(): number {
  const { session } = useLab();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!session) return;
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [session]);
  return session ? now - session.startedAt : 0;
}