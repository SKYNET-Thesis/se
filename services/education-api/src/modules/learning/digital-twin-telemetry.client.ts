import { Injectable, Optional } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import { isTwinInternalEndpoint } from "./digital-twin-endpoint";

type Fetcher = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

/** Server-to-server simulation telemetry bridge. It never accepts or relays physical state. */
@Injectable()
export class DigitalTwinTelemetryClient {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly fetcher: Fetcher;

  constructor(@Optional() environment?: NodeJS.ProcessEnv, @Optional() fetcher?: Fetcher) {
    this.environment = environment ?? process.env;
    this.fetcher = fetcher ?? fetch;
  }

  async publish(input: { organizationId: string; robotId: string; experimentId: string; attemptId?: string | null; telemetry: unknown }) {
    const telemetry = input.telemetry as Record<string, unknown> | null;
    if (!telemetry || telemetry.source_mode !== "SIMULATION" || telemetry.robot_id !== input.robotId) {
      return { status: "rejected" as const };
    }
    const secret = this.environment.DIGITAL_TWIN_SCOPE_SECRET?.trim();
    const endpoint = this.environment.DIGITAL_TWIN_TELEMETRY_URL?.trim();
    if (!secret || !endpoint || !isTwinInternalEndpoint(endpoint)) {
      return { status: "unavailable" as const };
    }
    const exp = Math.floor(Date.now() / 1000) + 60;
    const payload = { aud: "vista-digital-twin-simulation-publisher", exp, jti: randomUUID(), kind: "simulation_publisher", org: input.organizationId, robots: [input.robotId], sub: "education-api" };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    try {
      const response = await this.fetcher(`${endpoint.replace(/\/$/, "")}/internal/simulation-telemetry`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer v1.${encoded}.${signature}` },
        body: JSON.stringify({ organization_id: input.organizationId, robot_id: input.robotId, experiment_id: input.experimentId, ...(input.attemptId ? { attempt_id: input.attemptId } : {}), telemetry }),
        signal: AbortSignal.timeout(2000),
      });
      return response.ok ? { status: "accepted" as const, result: await response.json() } : { status: "rejected" as const };
    } catch {
      return { status: "unavailable" as const };
    }
  }
}
