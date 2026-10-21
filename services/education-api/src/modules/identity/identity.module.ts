import { Module } from "@nestjs/common";
import { PermissionsGuard } from "./auth/permissions.guard";
import { SupabaseAuthGuard } from "./auth/supabase-auth.guard";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";

@Module({
  controllers: [IdentityController],
  providers: [IdentityService, SupabaseAuthGuard, PermissionsGuard],
  exports: [SupabaseAuthGuard, PermissionsGuard],
})
export class IdentityModule {}
