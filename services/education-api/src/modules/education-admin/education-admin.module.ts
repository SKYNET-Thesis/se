import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { LearningModule } from "../learning/learning.module";
import { EducationAdminController } from "./education-admin.controller";
import { EducationAdminService } from "./education-admin.service";
import { SupabaseAdminService } from "./supabase-admin.service";
import { SchoolAdminQueryService } from "./school-admin-query.service";
import { ClassroomStudentImportService } from "./classroom-student-import.service";
import { StudentProvisioningService } from "./student-provisioning.service";

@Module({ imports: [IdentityModule, LearningModule], controllers: [EducationAdminController], providers: [EducationAdminService, SchoolAdminQueryService, SupabaseAdminService, StudentProvisioningService, ClassroomStudentImportService] })
export class EducationAdminModule {}
