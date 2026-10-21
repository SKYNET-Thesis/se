import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../identity/auth/permissions.guard";
import { RequirePermissions } from "../identity/auth/require-permissions.decorator";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { RuntimeService } from "./runtime.service";

@ApiTags("Robot runtime (read-only)") @ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, PermissionsGuard) @RequirePermissions("robot.manage")
@Controller("runtime")
export class RuntimeController {
  constructor(private readonly runtime: RuntimeService) {}
  @Get("health") health(){ return this.runtime.health(); }
  @Get("status") status(){ return this.runtime.status(); }
}
