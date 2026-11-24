import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { RobotRecordingService } from "./robot-recording.service";

/** Recording upload authorisation and retrieval for the signed-in student who owns the run (the Desktop signs in as that student). */
@ApiTags("Robot recordings") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class RobotRecordingController {
  constructor(private readonly recordings: RobotRecordingService) {}
  @Post("me/experiments/:experimentId/recordings/uploads")
  authorize(@CurrentUser() user: AuthenticatedUser, @Param("experimentId", ParseUUIDPipe) experimentId: string, @Body() body: unknown) { return this.recordings.authorizeUpload(user, experimentId, body); }
  @Get("me/experiments/:experimentId/recordings")
  list(@CurrentUser() user: AuthenticatedUser, @Param("experimentId", ParseUUIDPipe) experimentId: string) { return this.recordings.list(user, experimentId); }
  @Get("me/experiments/:experimentId/recordings/:artifactId/download")
  download(@CurrentUser() user: AuthenticatedUser, @Param("experimentId", ParseUUIDPipe) experimentId: string, @Param("artifactId", ParseUUIDPipe) artifactId: string) { return this.recordings.download(user, experimentId, artifactId); }
}
