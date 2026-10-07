import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { InfrastructureModule } from "../infrastructure/infrastructure.module";
import { HealthController } from "./health.controller";
import { StatusController } from "./status.controller";

@Module({
  imports: [TerminusModule, InfrastructureModule],
  controllers: [HealthController, StatusController],
})
export class ApiModule {}
