import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./features/health/health.module";
import { StatusModule } from "./features/status/status.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    HealthModule,
    StatusModule,
  ],
})
export class AppModule {}
