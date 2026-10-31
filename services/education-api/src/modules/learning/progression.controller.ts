import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { SubmitKnowledgeCheckDto } from "./dto/submit-knowledge-check.dto";
import { ProgressionService } from "./progression.service";

@ApiTags("Learning progression")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class ProgressionController {
  constructor(private readonly progression: ProgressionService) {}

  @Get("me/courses/:courseId/path")
  coursePath(@CurrentUser() user: AuthenticatedUser, @Param("courseId", ParseUUIDPipe) courseId: string) {
    return this.progression.coursePath(user, courseId);
  }

  @Post("me/attempts/:attemptId/knowledge-check")
  submitKnowledgeCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitKnowledgeCheckDto,
  ) {
    return this.progression.submitKnowledgeCheck(user, attemptId, dto);
  }
}
