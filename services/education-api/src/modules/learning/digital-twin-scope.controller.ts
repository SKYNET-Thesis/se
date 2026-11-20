import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { DigitalTwinScopeService } from "./digital-twin-scope.service";

export class AttemptViewerScopeDto {
  @IsUUID() robotId!: string;
  @IsOptional() @IsString() @MaxLength(128) labSessionId?: string;
}

@ApiTags("Digital Twin")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("robots")
export class DigitalTwinScopeController {
  constructor(private readonly scopes: DigitalTwinScopeService) {}

  @Get("digital-twin/availability")
  availability(@CurrentUser() user: AuthenticatedUser) {
    return this.scopes.availableRobots(user);
  }

  @Post(":robotId/digital-twin/viewer-scope")
  viewerScope(@CurrentUser() user: AuthenticatedUser, @Param("robotId", ParseUUIDPipe) robotId: string) {
    return this.scopes.issueViewerScope(user, robotId);
  }
}

@ApiTags("Digital Twin")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("me/attempts")
export class AttemptDigitalTwinController {
  constructor(private readonly scopes: DigitalTwinScopeService) {}

  /** Attempt-bound, read-only viewer scope (60 s). Students use this; the robot-wide route is retained for staff tooling only. */
  @Post(":attemptId/digital-twin/viewer-scope")
  viewerScope(@CurrentUser() user: AuthenticatedUser, @Param("attemptId", ParseUUIDPipe) attemptId: string, @Body() dto: AttemptViewerScopeDto) {
    return this.scopes.issueAttemptViewerScope(user, attemptId, dto.robotId, dto.labSessionId);
  }
}
