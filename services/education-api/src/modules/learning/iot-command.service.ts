import { Injectable, Optional, Inject } from "@nestjs/common";
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";

export interface IotPublisher { publish(topic: string, value: Record<string, unknown>): Promise<void>; }
/** A publisher can use these to preserve the safety distinction in lifecycle persistence. */
export class IotPublishDefiniteFailureError extends Error {}
export class IotPublishUnknownOutcomeError extends Error {}
export type IotRunCommand = {
  schemaVersion: number; kind: "run"; commandId: string; robotId: string; sequence: number;
  issuedAtMs: number; expiresAtMs: number; payload: Record<string, unknown>;
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
  constructor(
    @Optional() @Inject("IOT_COMMAND_ENV") environment?: NodeJS.ProcessEnv,
    @Optional() @Inject("IOT_COMMAND_PUBLISHER") publisher?: IotPublisher,
    private readonly now: () => number = () => Date.now(),
    private readonly uuid: () => string = () => crypto.randomUUID(),
  ) {
    this.environment = environment ?? process.env;
    this.publisher = publisher ?? (this.environment.VISTA_IOT_ENABLED === "true" ? new AwsIotPublisher(this.environment) : null);
  }
  enabled(): boolean { return this.publisher !== null; }
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
  async publishRun(robotId: string, sequence: number, payload: Record<string, unknown>) {
    const command = this.createRunCommand(robotId, sequence, payload);
    return this.publishRunCommand(command);
  }
}
