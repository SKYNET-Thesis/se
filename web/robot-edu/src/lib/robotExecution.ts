import { robotExecutionApi } from './api';
import type { CanonicalNestStep } from '../utils/robotProgram/toCanonicalNest';

export type PhysicalRobotStatus = { state: 'offline' | 'ready' | 'running' | 'fault'; robotName: string; message: string; isMock: boolean; };
export type PhysicalExecution = { id: string; state: 'queued' | 'running' | 'succeeded' | 'stopped' | 'failed'; step: number; total: number; label: string; message?: string; };

/** Browser boundary for physical execution. The backend is the only caller that
 * may contact the private R1 runtime and CHECKIK. */
export interface RobotExecutionClient {
  getRobotStatus(accessToken: string): Promise<PhysicalRobotStatus>;
  executeProgram(input: { accessToken: string; programVersionId: string; actionCount: number; steps: CanonicalNestStep[] }): Promise<PhysicalExecution>;
  getExecution(input: { accessToken: string; executionId: string }): Promise<PhysicalExecution>;
  stopExecution(input: { accessToken: string; executionId: string }): Promise<PhysicalExecution>;
}

/** Hard browser boundary: preview declarations must never cross into a physical client.
 * The R1 control plane must enforce the same contract when a physical endpoint lands. */
export function assertPhysicalExecutionEligible(steps: CanonicalNestStep[]): void {
  if (steps.some((step) => step.type === 'preview.move_xyz')) throw new Error('Physical execution rejected: preview.move_xyz is limited to learning preview.');
}

const offline = (): PhysicalRobotStatus => ({ state: 'offline', robotName: 'VISTA-01', message: 'Robot unavailable. You can still preview and evaluate your program.', isMock: false });

export class OfflineRobotExecutionClient implements RobotExecutionClient {
  async getRobotStatus() { return offline(); }
  async executeProgram({ steps }: { accessToken: string; programVersionId: string; actionCount: number; steps: CanonicalNestStep[] }) { assertPhysicalExecutionEligible(steps); throw new Error(offline().message); }
  async getExecution() { throw new Error(offline().message); }
  async stopExecution() { throw new Error(offline().message); }
}

/** Explicitly opt-in browser demo; it never leaves this tab and never controls hardware. */
export class MockRobotExecutionClient implements RobotExecutionClient {
  private runs = new Map<string, PhysicalExecution & { startedAt: number }>();
  async getRobotStatus() { return { state: 'ready' as const, robotName: 'VISTA-01 (demo)', message: 'Mock execution only — no physical robot is connected.', isMock: true }; }
  async executeProgram({ actionCount, steps }: { accessToken: string; programVersionId: string; actionCount: number; steps: CanonicalNestStep[] }) { assertPhysicalExecutionEligible(steps);
    const id = `mock-${crypto.randomUUID()}`; const run = { id, state: 'queued' as const, step: 0, total: Math.max(1, actionCount), label: 'Queued', startedAt: Date.now() }; this.runs.set(id, run); return this.snapshot(run);
  }
  async getExecution({ executionId }: { accessToken: string; executionId: string }) { const run = this.runs.get(executionId); if (!run) throw new Error('Execution was not found.'); if (run.state === 'queued' || run.state === 'running') { const step = Math.min(run.total, Math.floor((Date.now() - run.startedAt) / 900) + 1); run.state = step >= run.total ? 'succeeded' : 'running'; run.step = step; run.label = run.state === 'succeeded' ? 'Completed' : `Running action ${step}`; } return this.snapshot(run); }
  async stopExecution({ executionId }: { accessToken: string; executionId: string }) { const run = this.runs.get(executionId); if (!run) throw new Error('Execution was not found.'); run.state = 'stopped'; run.label = 'Stopped'; return this.snapshot(run); }
  private snapshot(run: PhysicalExecution) { return { ...run }; }
}

export class NestRobotExecutionClient implements RobotExecutionClient {
  async getRobotStatus(accessToken: string) { return parseStatus(await robotExecutionApi.status(accessToken)); }
  async executeProgram({ accessToken, programVersionId, actionCount, steps }: { accessToken: string; programVersionId: string; actionCount: number; steps: CanonicalNestStep[] }) { assertPhysicalExecutionEligible(steps); return parseExecution(await robotExecutionApi.execute(accessToken, programVersionId), actionCount); }
  async getExecution({ accessToken, executionId }: { accessToken: string; executionId: string }) { return parseExecution(await robotExecutionApi.execution(accessToken, executionId)); }
  async stopExecution({ accessToken, executionId }: { accessToken: string; executionId: string }) { return parseExecution(await robotExecutionApi.stop(accessToken, executionId)); }
}

function parseStatus(value: Record<string, unknown>): PhysicalRobotStatus { return { state: value.state === 'ready' || value.state === 'running' || value.state === 'fault' ? value.state : 'offline', robotName: typeof value.robotName === 'string' ? value.robotName : 'VISTA-01', message: typeof value.message === 'string' ? value.message : 'Robot status unavailable.', isMock: false }; }
function parseExecution(value: Record<string, unknown>, total = 0): PhysicalExecution { return { id: typeof value.id === 'string' ? value.id : '', state: value.state === 'queued' || value.state === 'running' || value.state === 'succeeded' || value.state === 'stopped' ? value.state : 'failed', step: typeof value.step === 'number' ? value.step : 0, total: typeof value.total === 'number' ? value.total : total, label: typeof value.label === 'string' ? value.label : 'Execution update', message: typeof value.message === 'string' ? value.message : undefined }; }

export function createRobotExecutionClient(): RobotExecutionClient {
  const mode = import.meta.env.VITE_ROBOT_EXECUTION_CLIENT;
  if (mode === 'mock') return new MockRobotExecutionClient();
  if (mode === 'nest') return new NestRobotExecutionClient();
  return new OfflineRobotExecutionClient();
}
