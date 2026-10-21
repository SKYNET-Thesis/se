import { Controller, Get, Query } from "@nestjs/common";
import { HealthCheck, HealthCheckResult } from "@nestjs/terminus";
import { HealthRequestDto } from "./dto/health-request.dto";
import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("health")
  @HealthCheck()
  check(@Query() _query: HealthRequestDto): Promise<HealthCheckResult> {
    return this.health.check();
  }
}
