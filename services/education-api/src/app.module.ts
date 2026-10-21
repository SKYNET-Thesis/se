import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { CommonModule } from "./common/common.module";
import { HealthModule } from "./modules/health/health.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { LearningModule } from "./modules/learning/learning.module";
import { StatusModule } from "./modules/status/status.module";
import { RuntimeModule } from "./modules/runtime/runtime.module";
import { MetadataModule } from "./modules/metadata/metadata.module";
import { EducationAdminModule } from "./modules/education-admin/education-admin.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    HealthModule,
    IdentityModule,
    LearningModule,
    StatusModule,
    RuntimeModule,
    MetadataModule,
    EducationAdminModule,
  ],
})
export class AppModule {}
