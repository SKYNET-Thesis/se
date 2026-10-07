import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ApiModule } from "./api/api.module";
import { ApplicationModule } from "./application/application.module";
import { DomainModule } from "./domain/domain.module";
import { InfrastructureModule } from "./infrastructure/infrastructure.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DomainModule,
    ApplicationModule,
    InfrastructureModule,
    ApiModule,
  ],
})
export class AppModule {}
