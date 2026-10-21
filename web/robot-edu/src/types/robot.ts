import type { ArmId, LogEntry, RobotProgram, SimState } from './robotProgram';

export type ConnectionState = 'connected' | 'disconnected' | 'unknown' | 'not_configured';
export type AdapterKind = 'simulation' | 'real';

export interface ArmStatus {
  arm: ArmId;
  state: 'idle' | 'moving' | 'fault' | 'unknown';
  gripper: 'open' | 'closed' | 'unknown';
}

export interface RobotStatus {
  adapterId: string;
  kind: AdapterKind;
  label: string;
  connection: ConnectionState;
  arms: Record<ArmId, ArmStatus>;
  message: string;
  checkedAt: string;
}

export interface ExecutionStep {
  blockId: string;
  label: string;
  index: number;
}

export interface ExecutionHandlers {
  onState?: (state: SimState) => void;
  onStep?: (step: ExecutionStep) => void;
  onLog?: (entry: LogEntry) => void;
}

export type ExecutionOutcome = 'completed' | 'stopped' | 'failed';

export interface ExecutionResult {
  outcome: ExecutionOutcome;
  steps: number;
  durationMs: number;
  finalState: SimState | null;
  error?: string;
}

export interface ExecutionOptions {
  signal: AbortSignal;
  /** Playback multiplier, simulation only. */
  speed?: number;
}

/**
 * Common contract for anything that can run a structured RobotProgram.
 * Adapters receive validated structured commands only — never generated source code.
 */
export interface RobotAdapter {
  readonly id: string;
  readonly kind: AdapterKind;
  readonly label: string;
  getStatus(): Promise<RobotStatus>;
  execute(program: RobotProgram, handlers: ExecutionHandlers, options: ExecutionOptions): Promise<ExecutionResult>;
}

export interface ExperimentRecord {
  id: string;
  programId: string;
  programName: string;
  assignmentId: string | null;
  adapter: AdapterKind;
  startedAt: string;
  durationMs: number;
  outcome: ExecutionOutcome;
  steps: number;
  note?: string;
}