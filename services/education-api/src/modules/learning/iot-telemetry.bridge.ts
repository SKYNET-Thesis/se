import { Prisma } from "@prisma/client";
import { classifyExecution } from "./execution-provenance";

/**
 * Edge → Digital Twin relay for SIMULATION telemetry, carried on the existing `status` topic / feedback queue as
 *   { schemaVersion:1, kind:"status", status:"telemetry", robotId, commandId, eventId, sequence, occurredAtMs, telemetry:<Twin JointState frame> }
 * It is deliberately separate from the command lifecycle: a telemetry message NEVER reads or writes the lifecycle, experiment, session or event tables,
 * can never complete or fail a command, and every outcome (including a Twin outage) is a dropped frame, not an error. Latest-state frames are
 * disposable, so there is no retry and no DLQ traffic.
 *
 * Only a run whose persisted runtime provenance is MOCK_RUNTIME and whose frame says SIMULATION is forwarded; physical telemetry is never relayed
 * (and simulation is never relabelled): the Twin's physical route needs a configured hardware owner and is not reachable from the queue.
 */
export const SO101_JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"] as const;
export type TelemetryOutcome = "forwarded" | `dropped:${string}`;
export interface TwinPublisherPort { publish(input: { organizationId: string; robotId: string; experimentId: string; attemptId?: string | null; telemetry: unknown }): Promise<{ status: string }>; }
type Db = { $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> };
type Correlation = { command_id: string; robot_id: string; state: string; experiment_id: string; organization_id: string; attempt_id: string | null; runtime_mode: string | null; execution_mode: string };

export const isTelemetryEvent = (value: unknown): boolean => Boolean(value) && typeof value === "object" && (value as { kind?: unknown }).kind === "status" && (value as { status?: unknown }).status === "telemetry";

export class IotTelemetryBridge {
  private readonly lastSequence = new Map<string, number>();
  private readonly recent = new Map<string, number[]>();
  constructor(
    private readonly db: Db,
    private readonly twin: TwinPublisherPort | null,
    private readonly now: () => number = () => Date.now(),
    private readonly limits = { maxPerSecondPerRobot: 5, maxAgeMs: 10_000, maxFutureMs: 2_000, maxTrackedCommands: 1000 },
  ) {}

  async handle(value: unknown): Promise<TelemetryOutcome> {
    try { return await this.process(value); } catch { return "dropped:internal_error"; }
  }

  private drop(reason: string): TelemetryOutcome { return `dropped:${reason}`; }

  private async process(value: unknown): Promise<TelemetryOutcome> {
    const event = value as Record<string, unknown>;
    if (!this.twin) return this.drop("bridge_disabled");
    if (event.schemaVersion !== 1 || typeof event.robotId !== "string" || typeof event.commandId !== "string" || typeof event.eventId !== "string"
      || !Number.isSafeInteger(event.sequence) || !Number.isSafeInteger(event.occurredAtMs)) return this.drop("malformed");
    const robotId = event.robotId, commandId = event.commandId, sequence = event.sequence as number, occurredAtMs = event.occurredAtMs as number;
    const now = this.now();
    if (occurredAtMs > now + this.limits.maxFutureMs) return this.drop("future");
    if (now - occurredAtMs > this.limits.maxAgeMs) return this.drop("stale");
    const frame = event.telemetry as Record<string, unknown> | undefined;
    const invalid = this.validateFrame(frame, robotId, now);
    if (invalid) return this.drop(invalid);
    // Ordering and idempotency are per command; a repeated or older sequence is a duplicate/out-of-order frame.
    const last = this.lastSequence.get(commandId);
    if (last !== undefined && sequence <= last) return this.drop("duplicate_or_out_of_order");
    if (!this.admit(robotId, now)) return this.drop("rate_limited");

    const rows = await this.db.$queryRaw<Correlation[]>(Prisma.sql`
      SELECT lifecycle.command_id,lifecycle.robot_id,lifecycle.state,lifecycle.experiment_id,session.organization_id,
        experiment.input_snapshot->>'attemptId' AS attempt_id,experiment.input_snapshot->>'runtimeAdapterMode' AS runtime_mode,experiment.execution_mode
      FROM public.iot_command_lifecycles lifecycle
      JOIN public.control_sessions session ON session.id=lifecycle.control_session_id
      JOIN public.learning_experiments experiment ON experiment.id=lifecycle.experiment_id
      WHERE lifecycle.command_id=${commandId}::uuid`);
    const row = rows[0];
    if (!row) return this.drop("unknown_command");
    if (row.robot_id !== robotId) return this.drop("robot_mismatch");
    if (row.state !== "acknowledged" && row.state !== "executing") return this.drop("command_not_active");
    if (classifyExecution({ executionMode: row.execution_mode, runtimeMode: row.runtime_mode }) !== "MOCK_RUNTIME") return this.drop("not_simulation_runtime");

    this.remember(commandId, sequence);
    const result = await this.twin.publish({ organizationId: row.organization_id, robotId, experimentId: row.experiment_id, attemptId: row.attempt_id, telemetry: frame });
    return result.status === "accepted" ? "forwarded" : this.drop(`twin_${result.status}`);
  }

  private validateFrame(frame: Record<string, unknown> | undefined, robotId: string, now: number): string | null {
    if (!frame || typeof frame !== "object") return "frame_missing";
    if (frame.schema_version !== 1) return "frame_schema";
    if (frame.source_mode !== "SIMULATION") return "source_mode_not_simulation";
    if (frame.robot_id !== robotId) return "frame_robot_mismatch";
    if (frame.connection !== "connected") return "frame_not_connected";
    const measuredAt = typeof frame.measured_at === "string" ? Date.parse(frame.measured_at) : NaN;
    if (!Number.isFinite(measuredAt)) return "frame_time";
    if (measuredAt > now + this.limits.maxFutureMs || now - measuredAt > this.limits.maxAgeMs) return "frame_stale";
    const measured = frame.measured;
    if (!Array.isArray(measured) || measured.length !== SO101_JOINTS.length) return "invalid_joints";
    for (let i = 0; i < SO101_JOINTS.length; i += 1) {
      const joint = measured[i] as Record<string, unknown> | null;
      if (!joint || joint.name !== SO101_JOINTS[i] || typeof joint.position !== "number" || !Number.isFinite(joint.position)) return "invalid_joints";
      if (joint.unit !== "rad" && joint.unit !== "deg" && joint.unit !== "percent") return "invalid_joints";
      if (joint.name !== "gripper" && joint.unit === "percent") return "invalid_joints";
    }
    return null;
  }

  private admit(robotId: string, now: number): boolean {
    const window = (this.recent.get(robotId) ?? []).filter((at) => now - at < 1000);
    if (window.length >= this.limits.maxPerSecondPerRobot) { this.recent.set(robotId, window); return false; }
    window.push(now); this.recent.set(robotId, window); return true;
  }

  private remember(commandId: string, sequence: number) {
    this.lastSequence.set(commandId, sequence);
    while (this.lastSequence.size > this.limits.maxTrackedCommands) this.lastSequence.delete(this.lastSequence.keys().next().value as string);
  }
}
