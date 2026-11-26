import { Prisma } from "@prisma/client";
import { classifyExecution } from "./execution-provenance";
import { SO101_JOINTS } from "./iot-telemetry.bridge";

/**
 * Edge → Digital Twin relay for PHYSICAL telemetry. It is a separate class, a separate worker branch and a separate Twin route from the simulation
 * bridge, and the two never share a code path: a frame that says it is physical can never reach the simulation endpoint and vice versa.
 *
 * Message (published by the Edge on the existing `status` topic; the existing IoT rule already forwards it because it carries a commandId):
 *   { schemaVersion:1, kind:"status", status:"physical_telemetry", robotId, commandId, eventId, sequence, occurredAtMs, adapterMode,
 *     measuredAt:<ISO-8601 with timezone>, observation:{ "<joint>.pos": number } }   // arm joints in degrees (|v|<=180), gripper in percent (0..100)
 *
 * What is NOT trusted: anything the Edge says about itself. Organization, experiment, attempt, learner and provenance come from the server's records
 * of the command (lifecycle -> control session -> experiment); a message that merely declares a physical adapter is not proof. A frame is relayed only if
 * ALL hold: the bridge is enabled; physical commissioning is configured and its window is open; the command belongs to the approved robot, to an
 * allowlisted learner and is acknowledged/executing; the persisted runtime provenance is PHYSICAL_ROBOT (an adapter mode the deployment declared);
 * the message's adapterMode equals the persisted one; and the observation is a complete, finite, in-range six-joint measurement.
 * Telemetry NEVER touches the lifecycle, experiment or session tables, never returns an error and never retries: a Twin outage drops the frame.
 */
export type PhysicalOutcome = "forwarded" | `dropped:${string}`;
export interface PhysicalTwinPort { publishPhysical(input: { ownerId: string; organizationId: string; robotId: string; measuredAt: string; observation: Record<string, number> }): Promise<{ status: string }>; }
export interface PhysicalPolicyPort { (): { robotId: string; userIds: ReadonlySet<string>; untilMs: number; runtimeModes: ReadonlySet<string> }; }
type Db = { $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> };
type Correlation = { robot_id: string; state: string; experiment_id: string; organization_id: string; learner_user_id: string; attempt_id: string | null; runtime_mode: string | null; execution_mode: string };

export const isPhysicalTelemetryEvent = (value: unknown): boolean => Boolean(value) && typeof value === "object" && (value as { kind?: unknown }).kind === "status" && (value as { status?: unknown }).status === "physical_telemetry";

export class IotPhysicalTelemetryBridge {
  private readonly lastSequence = new Map<string, number>();
  private readonly recent = new Map<string, number[]>();
  constructor(
    private readonly db: Db,
    private readonly twin: PhysicalTwinPort | null,
    private readonly policy: PhysicalPolicyPort | null,
    private readonly ownerId: string,
    private readonly now: () => number = () => Date.now(),
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly limits = { maxPerSecondPerRobot: 5, maxAgeMs: 10_000, maxFutureMs: 2_000, maxTrackedCommands: 1000 },
  ) {}

  async handle(value: unknown): Promise<PhysicalOutcome> {
    try { return await this.process(value); } catch { return "dropped:internal_error"; }
  }
  private drop(reason: string): PhysicalOutcome { return `dropped:${reason}`; }

  private async process(value: unknown): Promise<PhysicalOutcome> {
    const event = value as Record<string, unknown>;
    if (!isPhysicalTelemetryEvent(value)) return this.drop("not_physical_message"); // defence in depth: the router already selects only physical_telemetry
    if (!this.twin || !this.policy || !this.ownerId) return this.drop("bridge_disabled");
    let policy: ReturnType<PhysicalPolicyPort>;
    try { policy = this.policy(); } catch { return this.drop("commissioning_not_configured"); }
    const now = this.now();
    if (now > policy.untilMs) return this.drop("commissioning_window_closed");
    if (event.schemaVersion !== 1 || typeof event.robotId !== "string" || typeof event.commandId !== "string" || typeof event.eventId !== "string" || typeof event.adapterMode !== "string"
      || !Number.isSafeInteger(event.sequence) || !Number.isSafeInteger(event.occurredAtMs)) return this.drop("malformed");
    const robotId = event.robotId, commandId = event.commandId, sequence = event.sequence as number, occurredAtMs = event.occurredAtMs as number;
    if (robotId.toLowerCase() !== policy.robotId) return this.drop("robot_not_approved");
    if (occurredAtMs > now + this.limits.maxFutureMs) return this.drop("future");
    if (now - occurredAtMs > this.limits.maxAgeMs) return this.drop("stale");
    const measuredAtMs = typeof event.measuredAt === "string" ? Date.parse(event.measuredAt) : NaN;
    if (!Number.isFinite(measuredAtMs)) return this.drop("measured_at");
    if (measuredAtMs > now + this.limits.maxFutureMs || now - measuredAtMs > this.limits.maxAgeMs) return this.drop("measurement_stale");
    const observation = this.validObservation(event.observation);
    if (!observation) return this.drop("invalid_observation");
    const last = this.lastSequence.get(commandId);
    if (last !== undefined && sequence <= last) return this.drop("duplicate_or_out_of_order");
    if (!this.admit(robotId, now)) return this.drop("rate_limited");

    const rows = await this.db.$queryRaw<Correlation[]>(Prisma.sql`
      SELECT lifecycle.robot_id,lifecycle.state,lifecycle.experiment_id,session.organization_id,experiment.learner_user_id,
        experiment.input_snapshot->>'attemptId' AS attempt_id,experiment.input_snapshot->>'runtimeAdapterMode' AS runtime_mode,experiment.execution_mode
      FROM public.iot_command_lifecycles lifecycle
      JOIN public.control_sessions session ON session.id=lifecycle.control_session_id
      JOIN public.learning_experiments experiment ON experiment.id=lifecycle.experiment_id
      WHERE lifecycle.command_id=${commandId}::uuid`);
    const row = rows0(rows);
    if (!row) return this.drop("unknown_command");
    if (row.robot_id.toLowerCase() !== robotId.toLowerCase()) return this.drop("robot_mismatch");
    if (!policy.userIds.has(String(row.learner_user_id).toLowerCase())) return this.drop("user_not_authorized");
    if (row.state !== "acknowledged" && row.state !== "executing") return this.drop("command_not_active");
    // Provenance comes from what the server persisted when it accepted the start, judged by the deployment's declared physical modes.
    if (classifyExecution({ executionMode: row.execution_mode, runtimeMode: row.runtime_mode }, { ...this.env, VISTA_PHYSICAL_RUNTIME_MODES: [...policy.runtimeModes].join(",") }) !== "PHYSICAL_ROBOT") return this.drop("not_physical_provenance");
    if (!row.runtime_mode || row.runtime_mode !== event.adapterMode) return this.drop("adapter_mismatch");

    this.remember(commandId, sequence);
    const result = await this.twin.publishPhysical({ ownerId: this.ownerId, organizationId: row.organization_id, robotId, measuredAt: new Date(measuredAtMs).toISOString(), observation });
    return result.status === "accepted" ? "forwarded" : this.drop(`twin_${result.status}`);
  }

  private validObservation(value: unknown): Record<string, number> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>; const out: Record<string, number> = {};
    for (const joint of SO101_JOINTS) {
      const v = source[`${joint}.pos`];
      if (typeof v !== "number" || !Number.isFinite(v)) return null;
      if (joint === "gripper" ? v < 0 || v > 100 : v < -180 || v > 180) return null;
      out[`${joint}.pos`] = v;
    }
    return out;
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
const rows0 = <T,>(rows: T[]): T | undefined => rows[0];
