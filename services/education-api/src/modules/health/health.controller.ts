import { Controller, Get, Query } from "@nestjs/common";
import { HealthCheck, HealthCheckResult } from "@nestjs/terminus";
import { HealthRequestDto } from "./dto/health-request.dto";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Readiness (not liveness): 503 until the database schema matches this build. Use it for load-balancer targets and deployment gates. */
  @Get("health/ready")
  ready() {
    return this.health.ready();
  }

  @Get("health")
  @HealthCheck()
  check(@Query() _query: HealthRequestDto): Promise<HealthCheckResult> {
    return this.health.check();
  }
}
