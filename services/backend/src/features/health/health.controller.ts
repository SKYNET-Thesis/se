import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckResult } from "@nestjs/terminus";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  @HealthCheck()
  check(): Promise<HealthCheckResult> {
    return this.health.check();
  }
}
