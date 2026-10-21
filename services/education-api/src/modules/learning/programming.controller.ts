import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { CreateProgramDto } from "./dto/create-program.dto";
import { CreateProgramVersionDto } from "./dto/create-program-version.dto";
import { SubmitAttemptDto } from "./dto/submit-attempt.dto";
import { UpdateProgramDto } from "./dto/update-program.dto";
import { ProgrammingService } from "./programming.service";

@ApiTags("Learning programming")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class ProgrammingController {
  constructor(private readonly programming: ProgrammingService) {}

  @Get("me/attempts/:attemptId/program")
  programForAttempt(@CurrentUser() user: AuthenticatedUser, @Param("attemptId") attemptId: string) {
    return this.programming.programForAttempt(user, attemptId);
  }

  @Post("me/attempts/:attemptId/program")
  createProgram(@CurrentUser() user: AuthenticatedUser, @Param("attemptId") attemptId: string, @Body() dto: CreateProgramDto) {
    return this.programming.createProgram(user, attemptId, dto);
  }

  @Patch("me/programs/:programId")
  updateProgram(@CurrentUser() user: AuthenticatedUser, @Param("programId") programId: string, @Body() dto: UpdateProgramDto) {
    return this.programming.updateProgram(user, programId, dto);
  }

  @Get("me/programs/:programId/versions")
  versions(@CurrentUser() user: AuthenticatedUser, @Param("programId") programId: string) {
    return this.programming.versions(user, programId);
  }

  @Post("me/programs/:programId/versions")
  createVersion(@CurrentUser() user: AuthenticatedUser, @Param("programId") programId: string, @Body() dto: CreateProgramVersionDto) {
    return this.programming.createVersion(user, programId, dto);
  }

  @Post("me/attempts/:attemptId/submission")
  submit(@CurrentUser() user: AuthenticatedUser, @Param("attemptId") attemptId: string, @Body() dto: SubmitAttemptDto) {
    return this.programming.submit(user, attemptId, dto);
  }
}
