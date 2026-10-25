import { ConflictException, Inject, Injectable, Optional } from "@nestjs/common";

interface RuntimeMapping {
  baseUrl: string;
  logicalIdentity: string;
}

export interface RuntimeRunRequest {
  runId: string;
  programVersionId: string;
  profile: string;
  program: unknown;
}

export interface RuntimeSnapshot {
  runId?: string;
  state?: string;
  errorCode?: string | null;
  startedAtMs?: number | null;
  endedAtMs?: number | null;
  events?: unknown[];
  [key: string]: unknown;
}

type Fetcher = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

@Injectable()
export class RobotRuntimeClient {
  constructor(
    @Optional() @Inject("ROBOT_RUNTIME_ENV") environment?: NodeJS.ProcessEnv,
    @Optional() @Inject("ROBOT_RUNTIME_FETCHER") fetcher?: Fetcher,
  ) {
    this.environment = environment ?? process.env;
    this.fetcher = fetcher ?? fetch;
  }

  private readonly environment: NodeJS.ProcessEnv;
  private readonly fetcher: Fetcher;

  createRun(robotId: string, request: RuntimeRunRequest) {
    return this.request(robotId, "/runs", "POST", request);
  }

  getRun(robotId: string, runId: string) {
    return this.request(robotId, `/runs/${encodeURIComponent(runId)}`, "GET");
  }

  cancelRun(robotId: string, runId: string) {
    return this.request(robotId, `/runs/${encodeURIComponent(runId)}/cancel`, "POST");
  }

  status(robotId: string) {
    return this.request(robotId, "/status", "GET");
  }

  private mapping(robotId: string): RuntimeMapping {
    let mappings: Record<string, unknown> = {};
    try {
      mappings = JSON.parse(this.environment.VISTA_ROBOT_RUNTIME_MAP ?? "{}");
    } catch {
      throw this.failure("ROBOT_RUNTIME_CONFIGURATION_INVALID", "Robot execution is not configured correctly.");
    }
    const value = mappings[robotId];
    if (!value || typeof value !== "object") {
      throw this.failure("ROBOT_RUNTIME_NOT_CONFIGURED", "The allocated Robot has no execution runtime configured.");
    }
    const mapping = value as Record<string, unknown>;
    if (typeof mapping.baseUrl !== "string" || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(mapping.baseUrl) || typeof mapping.logicalIdentity !== "string") {
      throw this.failure("ROBOT_RUNTIME_CONFIGURATION_INVALID", "Robot execution is not configured correctly.");
    }
    return mapping as unknown as RuntimeMapping;
  }

  private async request(robotId: string, path: string, method: "GET" | "POST", body?: unknown): Promise<RuntimeSnapshot> {
    const mapping = this.mapping(robotId);
    const token = this.environment.VISTA_RUNTIME_TOKEN;
    if (!token) throw this.failure("ROBOT_RUNTIME_CONFIGURATION_INVALID", "Robot execution is not configured correctly.");
    try {
      const response = await this.fetcher(`${mapping.baseUrl}${path}`, {
        method,
        headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        if (response.status === 404) throw this.failure("ROBOT_RUNTIME_RUN_NOT_FOUND", "Robot execution state was lost after a runtime restart.");
        throw new Error("runtime_response_not_ok");
      }
      const value = await response.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("runtime_response_invalid");
      return value as RuntimeSnapshot;
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw this.failure("ROBOT_RUNTIME_UNAVAILABLE", "Robot execution service is unavailable.");
    }
  }

  private failure(code: string, message: string) {
    return new ConflictException({ code, message });
  }
}
