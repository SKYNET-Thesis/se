import { Injectable, Optional, Inject } from "@nestjs/common";
import { GetThingShadowCommand, IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";

export interface IotPublisher { publish(topic: string, value: Record<string, unknown>): Promise<void>; }
/** A publisher can use these to preserve the safety distinction in lifecycle persistence. */
export class IotPublishDefiniteFailureError extends Error {}
export class IotPublishUnknownOutcomeError extends Error {}

/** Device Shadow `reported` state written by the Edge Runtime (observed state only; never a control channel). */
export type IotShadowReported = {
  connection?: string; runtimeKind?: string; hardwareEnabled?: boolean; stopped?: boolean;
  activeRunId?: string | null; lastCommandSequence?: number; reportedAtMs?: number; schemaVersion?: number;
  /** Additive fields required only by the physical commissioning start. `armed` may be true only after a LOCAL operator action on the Edge. */
  adapterMode?: string; armed?: boolean; calibrationReady?: boolean; fault?: string | null;
};
export type PhysicalCommissioningPolicy = { robotId: string; userIds: ReadonlySet<string>; untilMs: number; runtimeModes: ReadonlySet<string> };
export interface IotShadowReader { read(thingName: string): Promise<IotShadowReported | null>; }

class AwsIotShadowReader implements IotShadowReader {
  private readonly client: IoTDataPlaneClient;
  constructor(environment: NodeJS.ProcessEnv) {
    const endpoint = environment.VISTA_IOT_DATA_ENDPOINT;
    if (!endpoint) throw new Error("VISTA_IOT_DATA_ENDPOINT is required when AWS IoT is enabled");
    this.client = new IoTDataPlaneClient({ endpoint: endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`, region: environment.AWS_REGION });
  }
  async read(thingName: string): Promise<IotShadowReported | null> {
    try {
      const out = await this.client.send(new GetThingShadowCommand({ thingName }));
      const doc = JSON.parse(Buffer.from(out.payload ?? []).toString("utf8")) as { state?: { reported?: IotShadowReported } };
      return doc.state?.reported ?? null;
    } catch (error) {
      if ((error as { name?: string }).name === "ResourceNotFoundException") return null;
      throw error;
    }
  }
}
export type IotRunCommand = {
  schemaVersion: number; kind: "run"; commandId: string; robotId: string; sequence: number;
  issuedAtMs: number; expiresAtMs: number; payload: Record<string, unknown>;
};

/**
 * Stop Execution (instructor): asks the Edge to stop ONE run. Same topic, envelope, TTL, sequence and dedupe rules as a run command; an Edge that does not
 * implement `cancel` rejects it (ACK `rejected`), which is safe. Receipt or ACK of a cancel is NEVER proof of a stop: the API only treats the target
 * command's own terminal status (published by the Edge after its local safe stop) as release of control. See docs/education/wf-01-robot-resource-allocation.md.
 */
export type IotCancelCommand = {
  schemaVersion: number; kind: "cancel"; commandId: string; robotId: string; sequence: number;
  issuedAtMs: number; expiresAtMs: number; payload: { targetCommandId: string; runId: string; reason: string };
};

class AwsIotPublisher implements IotPublisher {
  private readonly client: IoTDataPlaneClient;
  constructor(environment: NodeJS.ProcessEnv) {
    const endpoint = environment.VISTA_IOT_DATA_ENDPOINT;
    if (!endpoint) throw new Error("VISTA_IOT_DATA_ENDPOINT is required when AWS IoT is enabled");
    this.client = new IoTDataPlaneClient({ endpoint: endpoint.startsWith("https://") ? endpoint : `https://${endpoint}`, region: environment.AWS_REGION });
  }
  async publish(topic: string, value: Record<string, unknown>): Promise<void> {
    await this.client.send(new PublishCommand({ topic, qos: 1, payload: Buffer.from(JSON.stringify(value)) }));
  }
}

@Injectable()
export class IotCommandService {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly publisher: IotPublisher | null;
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly shadowReader: IotShadowReader | null;
  constructor(
    @Optional() @Inject("IOT_COMMAND_ENV") environment?: NodeJS.ProcessEnv,
    @Optional() @Inject("IOT_COMMAND_PUBLISHER") publisher?: IotPublisher,
    @Optional() @Inject("IOT_COMMAND_NOW") now?: () => number,
    @Optional() @Inject("IOT_COMMAND_UUID") uuid?: () => string,
    @Optional() @Inject("IOT_SHADOW_READER") shadowReader?: IotShadowReader,
  ) {
    this.environment = environment ?? process.env;
    this.publisher = publisher ?? (this.environment.VISTA_IOT_ENABLED === "true" ? new AwsIotPublisher(this.environment) : null);
    this.now = now ?? (() => Date.now());
    this.uuid = uuid ?? (() => crypto.randomUUID());
    this.shadowReader = shadowReader ?? (this.environment.VISTA_IOT_ENABLED === "true" && ["simulation", "physical_commissioning"].includes(String(this.environment.VISTA_IOT_START_MODE)) ? new AwsIotShadowReader(this.environment) : null);
  }
  enabled(): boolean { return this.publisher !== null; }
  /**
   * Student starts over AWS IoT are refused unless the deployment explicitly selects the simulation-only mode. That mode only ever accepts an Edge
   * whose Device Shadow says it is a mock runtime with the hardware driver disabled; a physical robot can never be started through it.
   */
  simulationStartEnabled(): boolean { return this.publisher !== null && this.environment.VISTA_IOT_START_MODE === "simulation" && this.shadowReader !== null; }
  /**
   * Supervised physical commissioning. Off unless VISTA_IOT_START_MODE=physical_commissioning. It never replaces local safety: the Device Shadow is only
   * ONE of the conditions (the API also requires the approved robot, an explicit user allowlist, an unexpired window and the student's safety
   * confirmation), and the Edge Safety Controller, local arming, calibration and emergency stop remain authoritative.
   */
  physicalStartEnabled(): boolean { return this.publisher !== null && this.environment.VISTA_IOT_START_MODE === "physical_commissioning" && this.shadowReader !== null; }
  physicalCommissioningPolicy(): PhysicalCommissioningPolicy {
    const list = (value?: string) => new Set((value ?? "").split(",").map((v) => v.trim()).filter(Boolean));
    const robotId = (this.environment.VISTA_PHYSICAL_COMMISSIONING_ROBOT_ID ?? "").trim().toLowerCase();
    const userIds = list(this.environment.VISTA_PHYSICAL_COMMISSIONING_USER_IDS);
    const untilMs = Date.parse(this.environment.VISTA_PHYSICAL_COMMISSIONING_UNTIL ?? "");
    const runtimeModes = list(this.environment.VISTA_PHYSICAL_RUNTIME_MODES);
    if (!robotId || userIds.size === 0 || !Number.isFinite(untilMs) || runtimeModes.size === 0) throw new Error("Physical commissioning is not fully configured.");
    return { robotId, userIds, untilMs, runtimeModes };
  }
  /** Observed state of one robot's Edge Runtime from its Device Shadow; null when the Thing has never reported. */
  async readShadow(robotId: string): Promise<IotShadowReported | null> {
    if (!this.shadowReader) throw new Error("Device Shadow reader is disabled");
    const prefix = (this.environment.VISTA_IOT_THING_PREFIX ?? "").replace(/-$/, "");
    if (!prefix) throw new Error("VISTA_IOT_THING_PREFIX is required for the simulation start mode");
    return this.shadowReader.read(`${prefix}-${robotId}`);
  }
  shadowMaxAgeMs(): number {
    const value = Number(this.environment.VISTA_IOT_SHADOW_MAX_AGE_MS ?? "30000");
    if (!Number.isSafeInteger(value) || value < 5000 || value > 300000) throw new Error("VISTA_IOT_SHADOW_MAX_AGE_MS must be 5000..300000");
    return value;
  }
  createRunCommand(robotId: string, sequence: number, payload: Record<string, unknown>): IotRunCommand {
    if (!this.publisher) throw new Error("AWS IoT command publisher is disabled");
    const ttl = Number(this.environment.VISTA_IOT_COMMAND_TTL_MS ?? "10000");
    if (!Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 60000) throw new Error("VISTA_IOT_COMMAND_TTL_MS must be 1000..60000");
    const issuedAtMs = this.now();
    return { schemaVersion: 1, kind: "run", commandId: this.uuid(), robotId, sequence, issuedAtMs, expiresAtMs: issuedAtMs + ttl, payload };
  }
  async publishRunCommand(command: IotRunCommand) {
    if (!this.publisher) throw new Error("AWS IoT command publisher is disabled");
    const prefix = (this.environment.VISTA_IOT_TOPIC_PREFIX ?? "").replace(/\/$/, "");
    if (!prefix) throw new Error("VISTA_IOT_TOPIC_PREFIX is required when AWS IoT is enabled");
    await this.publisher.publish(`${prefix}/${command.robotId}/commands`, command);
    return command;
  }
  createCancelCommand(robotId: string, payload: IotCancelCommand["payload"]): IotCancelCommand {
    if (!this.publisher) throw new Error("AWS IoT command publisher is disabled");
    const ttl = Math.min(30000, Number(this.environment.VISTA_IOT_COMMAND_TTL_MS ?? "10000"));
    if (!Number.isSafeInteger(ttl) || ttl < 1000) throw new Error("VISTA_IOT_COMMAND_TTL_MS must be 1000..60000");
    const issuedAtMs = this.now();
    return { schemaVersion: 1, kind: "cancel", commandId: this.uuid(), robotId, sequence: issuedAtMs, issuedAtMs, expiresAtMs: issuedAtMs + ttl, payload };
  }
  async publishCancelCommand(command: IotCancelCommand) {
    if (!this.publisher) throw new Error("AWS IoT command publisher is disabled");
    const prefix = (this.environment.VISTA_IOT_TOPIC_PREFIX ?? "").replace(/\/$/, "");
    if (!prefix) throw new Error("VISTA_IOT_TOPIC_PREFIX is required when AWS IoT is enabled");
    await this.publisher.publish(`${prefix}/${command.robotId}/commands`, command);
    return command;
  }
  async publishRun(robotId: string, sequence: number, payload: Record<string, unknown>) {
    const command = this.createRunCommand(robotId, sequence, payload);
    return this.publishRunCommand(command);
  }
}
