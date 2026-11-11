import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { AddAssignmentQuestionDto, CreateQuestionDto, CreateQuizAssignmentDto, ObjectiveMappingDto, QuestionSearchDto, ReorderAssignmentQuestionsDto, UpdateQuizAssignmentDto, UpdateVersionDto, VersionContentDto } from './dto/question-bank.dto';
import { QuestionBankService } from './question-bank.service';

@ApiTags('Question Bank')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller('author/question-bank')
export class QuestionBankController {
  constructor(private readonly bank: QuestionBankService) {}

  @Get('quiz-authoring/lessons/:lessonId/questions') quizQuestions(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Query('search') search = '', @Query('type') type?: string, @Query('page', new ParseIntPipe({ optional: true })) page = 1, @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20) {
    if (page < 1 || pageSize < 1 || pageSize > 100 || search.length > 80 || (type && !['single_choice', 'multiple_choice', 'true_false'].includes(type))) throw new BadRequestException('Question search filters are invalid.');
    return this.bank.quizAuthoringQuestions(user, lessonId, search, type, page, pageSize);
  }
  @Get('quiz-authoring/lessons/:lessonId/assignment') quizAssignment(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) { return this.bank.quizAuthoringAssignment(user, lessonId); }
  @Get('quiz-authoring/lessons/:lessonId/preview') quizPreview(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) { if (user.status !== 'active' || !user.systemPermissions.includes('org.manage')) return this.bank.quizAuthoringAssignment(user, lessonId); return this.bank.quizAuthoringAssignment(user, lessonId, true); }
  @Post('quiz-authoring/lessons/:lessonId/assignment') createQuizAssignment(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: CreateQuizAssignmentDto) { return this.bank.createQuizAssignment(user, lessonId, body.title, body.instructions, body.passPercent); }
  @Patch('quiz-authoring/lessons/:lessonId/assignment/:assignmentId') updateQuizAssignment(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() body: UpdateQuizAssignmentDto) { return this.bank.updateQuizAssignment(user, lessonId, assignmentId, body.title, body.instructions, body.passPercent); }

  @Post('questions') create(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateQuestionDto) { return this.bank.createQuestion(user, body); }
  @Get('questions') list(@CurrentUser() user: AuthenticatedUser, @Query() query: QuestionSearchDto) { return this.bank.list(user, query); }
  @Get('questions/:id') get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.bank.get(user, id); }
  @Get('questions/:id/versions') history(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.bank.history(user, id); }
  @Post('questions/:id/versions') version(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: VersionContentDto) { return this.bank.createVersion(user, id, body); }
  @Patch('versions/:id') update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateVersionDto) { return this.bank.updateDraft(user, id, body); }
  @Put('versions/:id/objectives') objectives(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ObjectiveMappingDto) { return this.bank.mapObjectives(user, id, body); }
  @Post('versions/:id/review') review(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.bank.submitReview(user, id); }
  @Post('versions/:id/publish') publish(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.bank.publish(user, id); }
  @Post('versions/:id/archive') archive(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.bank.archive(user, id); }
  @Get('assignments/:id/questions') assignmentQuestions(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) { return this.bank.assignmentQuestions(user, id); }
  @Post('assignments/:id/questions') add(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: AddAssignmentQuestionDto) { return this.bank.addToAssignment(user, id, body); }
  @Delete('assignments/:id/questions/:versionId') remove(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Param('versionId', ParseUUIDPipe) versionId: string) { return this.bank.removeFromAssignment(user, id, versionId); }
  @Put('assignments/:id/questions/order') order(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReorderAssignmentQuestionsDto) { return this.bank.reorderAssignment(user, id, body); }
}
