import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { SaveQuizDraftDto } from "./dto/save-quiz-draft.dto";
import { SubmitKnowledgeCheckDto } from "./dto/submit-knowledge-check.dto";
import { ProgressionService } from "./progression.service";
import { ActivityProgressService } from './activity-progress.service';

@ApiTags("Learning progression")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class ProgressionController {
  constructor(private readonly progression: ProgressionService, private readonly activityProgress: ActivityProgressService) {}

  @Get('me/courses/:courseId/activity-progress')
  courseActivityProgress(@CurrentUser() user: AuthenticatedUser, @Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.activityProgress.courseProgress(user, courseId);
  }

  @Post('me/activities/:activityId/complete')
  completeActivity(@CurrentUser() user: AuthenticatedUser, @Param('activityId') activityId: string, @Body() body: unknown) {
    if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0)) {
      throw new BadRequestException('Activity completion request must not include a body.');
    }
    return this.activityProgress.completeSelfReport(user, activityId);
  }

  @Get("me/courses/:courseId/path")
  coursePath(@CurrentUser() user: AuthenticatedUser, @Param("courseId", ParseUUIDPipe) courseId: string) {
    return this.progression.coursePath(user, courseId);
  }

  @Get("me/quizzes")
  myQuizzes(@CurrentUser() user: AuthenticatedUser) {
    return this.progression.myQuizzes(user);
  }

  @Get("me/courses/:courseId/qualification/c1-l4")
  async qualifiedL4Version(@CurrentUser() user: AuthenticatedUser, @Param("courseId", ParseUUIDPipe) courseId: string) {
    const qualification = await this.progression.resolveQualifiedL4ProgramVersion(user, courseId);
    if (!qualification) {
      throw new NotFoundException({
        code: "QUALIFIED_VERSION_NOT_FOUND",
        message: "No qualified ProgramVersion found for Course 1 Lesson 4.",
      });
    }
    return qualification;
  }

  @Post("me/attempts/:attemptId/knowledge-check")
  submitKnowledgeCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
    @Body() dto: SubmitKnowledgeCheckDto,
  ) {
    return this.progression.submitKnowledgeCheck(user, attemptId, dto);
  }

  @Put("me/attempts/:attemptId/draft")
  saveQuizDraft(@CurrentUser() user: AuthenticatedUser, @Param("attemptId", ParseUUIDPipe) attemptId: string, @Body() dto: SaveQuizDraftDto) {
    return this.progression.saveQuizDraft(user, attemptId, dto);
  }
}
