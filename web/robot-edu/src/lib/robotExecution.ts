import { robotExecutionApi } from './api';
import type { CanonicalNestStep } from '../utils/robotProgram/toCanonicalNest';

export type PhysicalRobotStatus = { state: 'offline' | 'ready' | 'running' | 'fault'; robotName: string; message: string; isMock: boolean; programVersionId?: string; eligible: boolean; };
export type PhysicalExecution = { id: string; state: 'pending'|'queued'|'running'|'succeeded'|'cancelled'|'stopped'|'preflight_failed'|'failed'; step: number; total: number; label: string; message?: string; robot?: { id:string; name:string; model:string; serial:string }; programVersion?: { id:string }; startedAt?:string|null; endedAt?:string|null; };

/** Browser boundary for physical execution. The backend is the only caller that
 * may contact the private R1 runtime and CHECKIK. */
export interface RobotExecutionClient {
  getRobotStatus(accessToken: string, attemptId: string): Promise<PhysicalRobotStatus>;
  restoreExecution(input: { accessToken:string; attemptId:string }): Promise<PhysicalExecution|null>;
  executeProgram(input: { accessToken: string; attemptId: string }): Promise<PhysicalExecution>;
  getExecution(input: { accessToken: string; executionId: string }): Promise<PhysicalExecution>;
  stopExecution(input: { accessToken: string; executionId: string }): Promise<PhysicalExecution>;
}

/** Hard browser boundary: preview declarations must never cross into a physical client.
 * The R1 control plane must enforce the same contract when a physical endpoint lands. */
export function assertPhysicalExecutionEligible(steps: CanonicalNestStep[]): void {
  if (steps.some((step) => step.type === 'preview.move_xyz')) throw new Error('Physical execution rejected: preview.move_xyz is limited to learning preview.');
}

const offline = (): PhysicalRobotStatus => ({ state: 'offline', robotName: 'Robot', message: 'Physical execution is unavailable. You can still preview and evaluate your program.', isMock: false, eligible:false });

export class OfflineRobotExecutionClient implements RobotExecutionClient {
  async getRobotStatus() { return offline(); }
  async restoreExecution() { return null; }
  async executeProgram():Promise<PhysicalExecution> { throw new Error(offline().message); }
  async getExecution():Promise<PhysicalExecution> { throw new Error(offline().message); }
  async stopExecution():Promise<PhysicalExecution> { throw new Error(offline().message); }
}

/** Explicitly opt-in browser demo; it never leaves this tab and never controls hardware. */
export class MockRobotExecutionClient implements RobotExecutionClient {
  private runs = new Map<string, PhysicalExecution & { startedAtMs: number }>();
  async getRobotStatus() { return { state: 'ready' as const, robotName: 'VISTA demo Robot', message: 'Mock execution only — no physical robot is connected.', isMock: true, eligible:true }; }
  async restoreExecution() { return null; }
  async executeProgram() {
    const id = `mock-${crypto.randomUUID()}`; const run = { id, state: 'queued' as const, step: 0, total: 1, label: 'Queued', startedAtMs: Date.now() }; this.runs.set(id, run); return this.snapshot(run);
  }
  async getExecution({ executionId }: { accessToken: string; executionId: string }) { const run = this.runs.get(executionId); if (!run) throw new Error('Execution was not found.'); if (run.state === 'queued' || run.state === 'running') { const step = Math.min(run.total, Math.floor((Date.now() - run.startedAtMs) / 900) + 1); run.state = step >= run.total ? 'succeeded' : 'running'; run.step = step; run.label = run.state === 'succeeded' ? 'Completed' : `Running action ${step}`; } return this.snapshot(run); }
  async stopExecution({ executionId }: { accessToken: string; executionId: string }) { const run = this.runs.get(executionId); if (!run) throw new Error('Execution was not found.'); run.state = 'stopped'; run.label = 'Stopped'; return this.snapshot(run); }
  private snapshot(run: PhysicalExecution) { return { ...run }; }
}

export class NestRobotExecutionClient implements RobotExecutionClient {
  async getRobotStatus(accessToken: string, attemptId:string) { return parseStatus(await robotExecutionApi.eligibility(accessToken, attemptId)); }
  async restoreExecution({accessToken,attemptId}:{accessToken:string;attemptId:string}) { const value=await robotExecutionApi.active(accessToken,attemptId); return value?parseExecution(value):null; }
  async executeProgram({ accessToken, attemptId }: { accessToken: string; attemptId:string }) { return parseExecution(await robotExecutionApi.execute(accessToken, attemptId)); }
  async getExecution({ accessToken, executionId }: { accessToken: string; executionId: string }) { return parseExecution(await robotExecutionApi.execution(accessToken, executionId)); }
  async stopExecution({ accessToken, executionId }: { accessToken: string; executionId: string }) { return parseExecution(await robotExecutionApi.stop(accessToken, executionId)); }
}

function parseStatus(value: Record<string, unknown>): PhysicalRobotStatus { const robot=value.robot as Record<string,unknown>|undefined; const version=value.programVersion as Record<string,unknown>|undefined; const eligible=value.eligible===true; return { state:eligible?'ready':'offline', robotName:typeof robot?.name==='string'?robot.name:'Robot', message:eligible?'Authoritative evidence and Robot allocation are ready.':typeof value.message==='string'?value.message:'Physical execution is not eligible.', isMock:false, eligible, programVersionId:typeof version?.id==='string'?version.id:undefined }; }
function parseExecution(value: Record<string, unknown>, total = 0): PhysicalExecution { const status=typeof value.status==='string'?value.status:'failed'; const allowed=['pending','queued','running','succeeded','cancelled','stopped','preflight_failed','failed']; return { id: typeof value.id === 'string' ? value.id : '', state: allowed.includes(status)?status as PhysicalExecution['state']:'failed', step: typeof value.step === 'number' ? value.step : 0, total: typeof value.total === 'number' ? value.total : total, label: typeof value.label === 'string' ? value.label : status.replace(/_/g,' '), message: typeof value.message === 'string' ? value.message : typeof value.error==='string'?value.error:undefined, robot:value.robot as PhysicalExecution['robot'], programVersion:value.programVersion as PhysicalExecution['programVersion'], startedAt:typeof value.startedAt==='string'?value.startedAt:null, endedAt:typeof value.endedAt==='string'?value.endedAt:null }; }

export function createRobotExecutionClient(): RobotExecutionClient {
  const mode = import.meta.env.VITE_ROBOT_EXECUTION_CLIENT;
  if (mode === 'mock') return new MockRobotExecutionClient();
  if (mode === 'offline') return new OfflineRobotExecutionClient();
  return new NestRobotExecutionClient();
}
