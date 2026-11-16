import { SO101_NAMES } from './so101Model';
import type { JointReading, JointState } from './twinTelemetry';
import { ARM_IDENTITIES, type ArmIdentity } from './types';

export type MotionPattern = 'pick_and_place' | 'wave' | 'mirroring';

interface JointTrajectoryPoint {
  shoulder_pan: number; // rad
  shoulder_lift: number; // rad
  elbow_flex: number; // rad
  wrist_flex: number; // rad
  wrist_roll: number; // rad
  gripper: number; // percent 0..100
}

/**
 * Procedural trajectory generator for SO-101 tabletop manipulation.
 * Returns joint positions in valid URDF ranges.
 */
function calculateTrajectory(
  pattern: MotionPattern,
  t: number,
  side: 'left' | 'right',
  isFollower: boolean,
  followerLagSec: number
): JointTrajectoryPoint {
  // Add follower lag if applicable
  const effectiveT = isFollower ? Math.max(0, t - followerLagSec) : t;
  const sideSign = side === 'left' ? 1 : -1;

  if (pattern === 'pick_and_place') {
    // 8-second cyclical pick and place motion
    const cycle = (effectiveT % 8) / 8; // 0..1
    let pan = 0;
    let lift = 0;
    let elbow = 0;
    let wristF = 0;
    let wristR = 0;
    let grip = 20;

    if (cycle < 0.25) {
      // Phase 1: Reach down to pick location
      const p = cycle / 0.25;
      pan = sideSign * (0.2 + 0.3 * Math.sin(p * Math.PI * 0.5));
      lift = -0.6 * p;
      elbow = 0.5 * p;
      wristF = 0.1 * p;
      wristR = sideSign * 0.2 * p;
      grip = 85; // open
    } else if (cycle < 0.35) {
      // Phase 2: Grasp object
      pan = sideSign * 0.5;
      lift = -0.6;
      elbow = 0.5;
      wristF = 0.1;
      wristR = sideSign * 0.2;
      const p = (cycle - 0.25) / 0.1;
      grip = 85 - 65 * p; // closing down to 20%
    } else if (cycle < 0.6) {
      // Phase 3: Lift and carry to place target
      const p = (cycle - 0.35) / 0.25;
      pan = sideSign * (0.5 - 0.9 * p);
      lift = -0.6 + 0.4 * Math.sin(p * Math.PI);
      elbow = 0.5 - 0.2 * Math.sin(p * Math.PI);
      wristF = 0.1 - 0.2 * p;
      wristR = sideSign * (0.2 - 0.4 * p);
      grip = 20; // holding
    } else if (cycle < 0.75) {
      // Phase 4: Release object
      pan = sideSign * -0.4;
      lift = -0.5;
      elbow = 0.4;
      wristF = -0.1;
      wristR = sideSign * -0.2;
      const p = (cycle - 0.6) / 0.15;
      grip = 20 + 65 * p; // releasing open to 85%
    } else {
      // Phase 5: Retract to ready stance
      const p = (cycle - 0.75) / 0.25;
      pan = sideSign * (-0.4 + 0.6 * p);
      lift = -0.5 * (1 - p);
      elbow = 0.4 * (1 - p);
      wristF = -0.1 * (1 - p);
      wristR = sideSign * -0.2 * (1 - p);
      grip = 85 - 65 * p; // close slightly to neutral 20%
    }

    // Follower has slight mechanical tracking non-linearity
    if (isFollower) {
      const jitter = Math.sin(effectiveT * 25) * 0.003;
      pan += jitter;
      lift += jitter * 0.5;
    }

    return {
      shoulder_pan: pan,
      shoulder_lift: lift,
      elbow_flex: elbow,
      wrist_flex: wristF,
      wrist_roll: wristR,
      gripper: Math.max(0, Math.min(100, grip)),
    };
  }

  if (pattern === 'wave') {
    // Harmonic wave across all joints
    const omega = 1.2;
    const pan = sideSign * 0.5 * Math.sin(effectiveT * omega);
    const lift = -0.3 + 0.35 * Math.sin(effectiveT * omega * 0.8 + 0.5);
    const elbow = 0.2 + 0.4 * Math.cos(effectiveT * omega * 0.6);
    const wristF = 0.25 * Math.sin(effectiveT * omega * 1.4);
    const wristR = sideSign * 0.8 * Math.sin(effectiveT * omega * 0.5);
    const grip = 50 + 45 * Math.sin(effectiveT * omega * 2);

    return {
      shoulder_pan: pan,
      shoulder_lift: lift,
      elbow_flex: elbow,
      wrist_flex: wristF,
      wrist_roll: wristR,
      gripper: Math.max(0, Math.min(100, grip)),
    };
  }

  // 'mirroring' pattern: simulated manual teleoperation with intermittent human adjustments
  const step = Math.floor(effectiveT / 2.5);
  const phase = (effectiveT % 2.5) / 2.5;
  const smoothPhase = 0.5 - 0.5 * Math.cos(phase * Math.PI);

  const keyPan = [0.1, 0.4, 0.2, -0.3, -0.1][step % 5] * sideSign;
  const nextPan = [0.4, 0.2, -0.3, -0.1, 0.1][step % 5] * sideSign;
  const pan = keyPan + (nextPan - keyPan) * smoothPhase;

  const keyLift = [-0.1, -0.4, -0.2, -0.5, 0.0][step % 5];
  const nextLift = [-0.4, -0.2, -0.5, 0.0, -0.1][step % 5];
  const lift = keyLift + (nextLift - keyLift) * smoothPhase;

  const keyElbow = [0.1, 0.3, 0.5, 0.2, 0.0][step % 5];
  const nextElbow = [0.3, 0.5, 0.2, 0.0, 0.1][step % 5];
  const elbow = keyElbow + (nextElbow - keyElbow) * smoothPhase;

  const wristF = 0.15 * Math.sin(effectiveT * 2);
  const wristR = sideSign * 0.4 * Math.cos(effectiveT * 1.5);
  const grip = (effectiveT % 5 < 2.5) ? 15 : 75;

  return {
    shoulder_pan: pan,
    shoulder_lift: lift,
    elbow_flex: elbow,
    wrist_flex: wristF,
    wrist_roll: wristR,
    gripper: grip,
  };
}

export class MockTelemetryProvider {
  private isRunning = false;
  private pattern: MotionPattern = 'pick_and_place';
  private speed = 1.0;
  private intervalId: number | null = null;
  private sequenceCounters: Record<ArmIdentity, number> = {
    leader_left: 0,
    follower_left: 0,
    leader_right: 0,
    follower_right: 0,
  };
  private simulatedElapsed = 0;
  private lastTickMs = 0;
  private dropUntilMs = 0;
  private listeners = new Set<(frames: Record<ArmIdentity, JointState>) => void>();

  constructor(private readonly rateHz = 30) {}

  public subscribe(callback: (frames: Record<ArmIdentity, JointState>) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTickMs = performance.now();
    const intervalMs = Math.round(1000 / this.rateHz);
    this.intervalId = window.setInterval(() => this.tick(), intervalMs);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public setPattern(pattern: MotionPattern): void {
    this.pattern = pattern;
  }

  public getPattern(): MotionPattern {
    return this.pattern;
  }

  public setSpeed(speed: number): void {
    this.speed = Math.max(0.1, Math.min(5.0, speed));
  }

  public getSpeed(): number {
    return this.speed;
  }

  public simulatePacketDrop(durationMs = 2000): void {
    this.dropUntilMs = performance.now() + durationMs;
  }

  public generateSnapshot(now = Date.now(), isDropped = false): Record<ArmIdentity, JointState> {
    const isoString = new Date(now).toISOString();
    const result: Partial<Record<ArmIdentity, JointState>> = {};

    for (const armId of ARM_IDENTITIES) {
      const isLeft = armId.includes('left');
      const isFollower = armId.includes('follower');
      const side = isLeft ? 'left' : 'right';

      const traj = calculateTrajectory(
        this.pattern,
        this.simulatedElapsed,
        side,
        isFollower,
        0.035 // 35ms tracking latency for follower
      );

      const seq = this.sequenceCounters[armId]++;
      const measured: JointReading[] = SO101_NAMES.map((name) => {
        const pos = traj[name];
        return {
          name,
          position: Number.isFinite(pos) ? pos : 0,
          unit: name === 'gripper' ? 'percent' : 'rad',
        };
      });

      result[armId] = {
        schema_version: 1,
        robot_id: armId,
        source_mode: 'SIMULATION',
        controller_id: `mock-engine-${armId}`,
        measured_at: isoString,
        sequence: seq,
        connection: isDropped ? 'disconnected' : 'connected',
        measured,
        calibration_status: 'NOT_APPLICABLE',
      };
    }

    return result as Record<ArmIdentity, JointState>;
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTickMs) / 1000);
    this.lastTickMs = now;

    this.simulatedElapsed += dt * this.speed;
    const isDropped = now < this.dropUntilMs;

    const frames = this.generateSnapshot(Date.now(), isDropped);
    for (const listener of this.listeners) {
      listener(frames);
    }
  }
}
