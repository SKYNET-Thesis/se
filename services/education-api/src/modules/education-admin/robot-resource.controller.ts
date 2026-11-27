import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { CreateRobotResourceDto, GrantRobotEntitlementDto, UpdateRobotResourceDto } from "./dto/robot-resource.dto";
import { RobotResourceService } from "./robot-resource.service";

@ApiTags("Robot resources (System Administrator)")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("education-admin/robots")
export class RobotResourceController {
  constructor(private readonly robots: RobotResourceService) {}
  @Get() list(@CurrentUser() user: AuthenticatedUser) { return this.robots.list(user); }
  @Post() create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRobotResourceDto) { return this.robots.create(user, dto); }
  @Get(":robotId") detail(@CurrentUser() user: AuthenticatedUser, @Param("robotId", ParseUUIDPipe) robotId: string) { return this.robots.detail(user, robotId); }
  @Patch(":robotId") update(@CurrentUser() user: AuthenticatedUser, @Param("robotId", ParseUUIDPipe) robotId: string, @Body() dto: UpdateRobotResourceDto) { return this.robots.update(user, robotId, dto); }
  @Post(":robotId/entitlements") grant(@CurrentUser() user: AuthenticatedUser, @Param("robotId", ParseUUIDPipe) robotId: string, @Body() dto: GrantRobotEntitlementDto) { return this.robots.grantEntitlement(user, robotId, dto); }
  @Delete(":robotId/entitlements/:entitlementId") revoke(@CurrentUser() user: AuthenticatedUser, @Param("robotId", ParseUUIDPipe) robotId: string, @Param("entitlementId", ParseUUIDPipe) entitlementId: string) { return this.robots.revokeEntitlement(user, robotId, entitlementId); }
}
