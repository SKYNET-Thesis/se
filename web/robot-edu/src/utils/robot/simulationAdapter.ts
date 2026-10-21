import type { ExecutionHandlers, ExecutionOptions, ExecutionResult, RobotAdapter, RobotStatus } from '../../types/robot';
import type { RobotProgram } from '../../types/robotProgram';
import { runSimulation } from '../robotProgram/simulator';

/** Runs structured RobotPrograms against the in-browser schematic simulator. */
export class SimulationRobotAdapter implements RobotAdapter {
  readonly id = 'sim-tabletop';
  readonly kind = 'simulation' as const;
  readonly label = 'Schematic simulator';

  async getStatus(): Promise<RobotStatus> {
    return {
      adapterId: this.id,
      kind: this.kind,
      label: this.label,
      connection: 'connected',
      arms: {
        left: { arm: 'left', state: 'idle', gripper: 'open' },
        right: { arm: 'right', state: 'idle', gripper: 'open' }
      },
      message: 'Runs in this browser. Kinematic sketch only: no physics, no collision checking.',
      checkedAt: new Date().toISOString()
    };
  }

  execute(program: RobotProgram, handlers: ExecutionHandlers, options: ExecutionOptions): Promise<ExecutionResult> {
    return runSimulation(program, { signal: options.signal, speed: options.speed ?? 1, handlers });
  }
}