import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { HealthRepository } from "./health.repository";
import { HealthService } from "./health.service";
import { VersionController } from "./version.controller";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController, VersionController],
  providers: [HealthRepository, HealthService],
})
export class HealthModule {}
