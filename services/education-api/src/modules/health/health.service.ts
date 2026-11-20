import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import {
  HealthCheckResult,
  HealthCheckService,
  HealthIndicator,
} from "@nestjs/terminus";
import { HealthRepository } from "./health.repository";

@Injectable()
export class HealthService extends HealthIndicator {
  constructor(
    private readonly health: HealthCheckService,
    private readonly repository: HealthRepository,
  ) {
    super();
  }

  check(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => this.getStatus("postgres", await this.repository.canConnect()),
    ]);
  }

  /** Readiness for load balancers and deployment gates: 200 only when the database answers AND the schema matches this build. */
  async ready() {
    const checks = await this.repository.schemaReadiness();
    const expectedRole = process.env.DATABASE_RUNTIME_ROLE?.trim();
    const roleOk = !expectedRole || checks.runtimeRole === expectedRole || (checks.runtimeRole ?? "").startsWith(`${expectedRole}.`);
    const result = { status: checks.database && checks.academicMetadataColumns && checks.mediaArchiveColumns && roleOk ? "ready" : "not_ready", checks: { database: checks.database, academicMetadataColumns: checks.academicMetadataColumns, mediaArchiveColumns: checks.mediaArchiveColumns, runtimeRole: roleOk } };
    if (result.status !== "ready") throw new ServiceUnavailableException(result);
    return result;
  }
}
