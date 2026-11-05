import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { DigitalTwinScopeService } from "./digital-twin-scope.service";

@ApiTags("Digital Twin")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("robots")
export class DigitalTwinScopeController {
  constructor(private readonly scopes: DigitalTwinScopeService) {}

  @Post(":robotId/digital-twin/viewer-scope")
  viewerScope(@CurrentUser() user: AuthenticatedUser, @Param("robotId", ParseUUIDPipe) robotId: string) {
    return this.scopes.issueViewerScope(user, robotId);
  }
}
