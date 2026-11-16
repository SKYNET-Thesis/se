/**
 * Execution provenance, decided ONLY on the server from facts the server persisted: the execution mode it created and the adapter mode the runtime
 * itself reported when the run started. The browser sends neither, so it cannot influence them.
 *
 *   SIMULATION         the execution was a simulation or a schematic evaluation (no robot)
 *   MOCK_RUNTIME       a real_robot execution whose runtime states it is a fake/mock follower (nothing physical moved)
 *   PHYSICAL_ROBOT     a real_robot execution whose runtime reported an adapter mode the deployment has declared physical
 *   UNVERIFIED_RUNTIME a real_robot execution whose runtime did not say what drove the robot (or said something undeclared)
 *
 * Only PHYSICAL_ROBOT may satisfy a physical practical lesson. Deployments declare which runtime adapter modes are physical with
 * VISTA_PHYSICAL_RUNTIME_MODES (comma separated; empty by default, so nothing counts as physical until configured). A transitional flag,
 * VISTA_ACCEPT_UNSTATED_RUNTIME_AS_PHYSICAL=1, accepts a runtime that states no mode; it is off by default and exists only so an existing
 * deployment can migrate once its runtime reports its mode.
 */
export type ExecutionProvenance = 'SIMULATION' | 'MOCK_RUNTIME' | 'PHYSICAL_ROBOT' | 'UNVERIFIED_RUNTIME';

const SIMULATED_MODES = new Set(['simulation', 'offline_replay', 'schematic']);
const isMockMode = (mode: string) => /^(fake|mock)/i.test(mode) || /(fake|mock)/i.test(mode);

export function classifyExecution(input: { executionMode: string; runtimeMode?: string | null }, env: NodeJS.ProcessEnv = process.env): ExecutionProvenance {
  if (SIMULATED_MODES.has(input.executionMode)) return 'SIMULATION';
  if (input.executionMode !== 'real_robot') return 'UNVERIFIED_RUNTIME';
  const mode = (input.runtimeMode ?? '').trim();
  if (mode && isMockMode(mode)) return 'MOCK_RUNTIME';           // a mock can never be promoted, even if someone lists it as physical
  const declared = new Set((env.VISTA_PHYSICAL_RUNTIME_MODES ?? '').split(',').map((m) => m.trim()).filter(Boolean));
  if (mode && declared.has(mode)) return 'PHYSICAL_ROBOT';
  if (!mode && env.VISTA_ACCEPT_UNSTATED_RUNTIME_AS_PHYSICAL === '1') return 'PHYSICAL_ROBOT';
  return 'UNVERIFIED_RUNTIME';
}

export const satisfiesPhysicalPractical = (provenance: ExecutionProvenance) => provenance === 'PHYSICAL_ROBOT';

export const PROVENANCE_LABEL: Record<ExecutionProvenance, string> = {
  SIMULATION: 'Simulation',
  MOCK_RUNTIME: 'Mock runtime (no physical robot moved)',
  PHYSICAL_ROBOT: 'Physical robot',
  UNVERIFIED_RUNTIME: 'Robot runtime, physical execution not verified',
};
