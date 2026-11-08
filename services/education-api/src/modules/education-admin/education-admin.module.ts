import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { LearningModule } from "../learning/learning.module";
import { EducationAdminController } from "./education-admin.controller";
import { EducationAdminService } from "./education-admin.service";
import { SupabaseAdminService } from "./supabase-admin.service";
import { SchoolAdminQueryService } from "./school-admin-query.service";
import { ClassroomStudentImportService } from "./classroom-student-import.service";
import { StudentProvisioningService } from "./student-provisioning.service";
import { StudentAuthController } from "./student-auth.controller";
import { StudentAuthService } from "./student-auth.service";
import { StudentAuthHttpsGuard } from "./student-auth-https.guard";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";

@Module({ imports: [IdentityModule, LearningModule], controllers: [EducationAdminController, StudentAuthController], providers: [EducationAdminService, SchoolAdminQueryService, SupabaseAdminService, StudentProvisioningService, ClassroomStudentImportService, StudentAuthService, StudentAuthHttpsGuard, StudentAuthRateLimitGuard] })
export class EducationAdminModule {}
