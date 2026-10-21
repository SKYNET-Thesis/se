import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "./auth/current-user.decorator";
import { AuthenticatedUser } from "./auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "./auth/supabase-auth.guard";
import { UpdateMyProfileDto } from "./dto/update-my-profile.dto";
import { IdentityService } from "./identity.service";

@ApiTags("Identity")
@ApiBearerAuth()
@Controller("me")
@UseGuards(SupabaseAuthGuard)
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  getMe(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.identityService.getMe(currentUser);
  }

  @Get("permissions")
  getMyPermissions(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.identityService.getMyPermissions(currentUser);
  }

  @Get("roles")
  getMyRoles(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.identityService.getMyRoles(currentUser);
  }

  @Get("memberships")
  getMyMemberships(@CurrentUser() currentUser: AuthenticatedUser) {
    return this.identityService.getMyMemberships(currentUser);
  }

  @Patch("profile")
  updateMyProfile(@CurrentUser() currentUser: AuthenticatedUser, @Body() dto: UpdateMyProfileDto) {
    return this.identityService.updateMyProfile(currentUser, dto);
  }
}
