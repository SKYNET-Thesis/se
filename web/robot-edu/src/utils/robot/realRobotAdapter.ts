import type { ExecutionResult, RobotAdapter, RobotStatus } from '../../types/robot';
import type { RobotProgram } from '../../types/robotProgram';

/**
 * Transport the robot control backend must provide. Intentionally NOT implemented:
 * no production robot API was found in this repository, so none is invented here.
 * Safety (limits, e-stop, authorization, collision avoidance) must be enforced by the
 * backend runtime and independent hardware safeguards, never by this browser client.
 */
export interface RealRobotTransport {
  fetchStatus(signal?: AbortSignal): Promise<RobotStatus>;
  submitProgram(program: RobotProgram, signal: AbortSignal): Promise<{runId: string;}>;
  cancel(runId: string): Promise<void>;
}

export const REAL_ROBOT_INTEGRATION = {
  verified: false,
  reason: 'The robot control backend has not been connected or verified, so execution on physical hardware is disabled.'
} as const;

export class RealRobotAdapter implements RobotAdapter {
  readonly id = 'real-dual-arm';
  readonly kind = 'real' as const;
  readonly label = 'Dual-arm robot (hardware)';

  constructor(private readonly transport: RealRobotTransport | null) {}

  async getStatus(): Promise<RobotStatus> {
    if (this.transport) return this.transport.fetchStatus();
    return {
      adapterId: this.id,
      kind: this.kind,
      label: this.label,
      connection: 'not_configured',
      arms: {
        left: { arm: 'left', state: 'unknown', gripper: 'unknown' },
        right: { arm: 'right', state: 'unknown', gripper: 'unknown' }
      },
      message: REAL_ROBOT_INTEGRATION.reason,
      checkedAt: new Date().toISOString()
    };
  }

  async execute(): Promise<ExecutionResult> {
    throw new Error(REAL_ROBOT_INTEGRATION.reason);
  }
}