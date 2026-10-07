import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
} from "@nestjs/terminus";
import { DatabaseService } from "../infrastructure/persistence/database.service";

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseService,
  ) {}

  @Get("health")
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.isHealthy()]);
  }
}
