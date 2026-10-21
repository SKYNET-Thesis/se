import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { LearningModule } from "../learning/learning.module";
import { EducationAdminController } from "./education-admin.controller";
import { EducationAdminService } from "./education-admin.service";

@Module({ imports: [IdentityModule, LearningModule], controllers: [EducationAdminController], providers: [EducationAdminService] })
export class EducationAdminModule {}
