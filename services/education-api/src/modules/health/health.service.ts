import { Injectable } from "@nestjs/common";
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
}
