import { BadRequestException, Body, Controller, Delete, Get, Res, StreamableFile, UploadedFile, UseInterceptors, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { AddAssignmentQuestionDto, CreateQuestionDto, CreateQuizAssignmentDto, ObjectiveMappingDto, QuestionSearchDto, ReorderAssignmentQuestionsDto, UpdateQuizAssignmentDto, UpdateVersionDto, VersionContentDto } from './dto/question-bank.dto';
import { AuthorLessonQuestionDto } from './dto/question-bank.dto';
import { IMPORT_MAX_BYTES, buildXlsx, templateTable, toCsv } from './question-import';
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

  @Get('quiz-authoring/import-template') importTemplate(@Query('format') format = 'csv', @Res({ passthrough: true }) res: { set(h: Record<string, string>): void }) {
    if (format !== 'csv' && format !== 'xlsx') throw new BadRequestException('Template format must be csv or xlsx.');
    res.set({ 'Content-Disposition': `attachment; filename="question-bank-template.${format}"`, 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    return new StreamableFile(format === 'csv' ? Buffer.from(toCsv(templateTable())) : buildXlsx(templateTable()));
  }
  @Post('quiz-authoring/lessons/:lessonId/import/preview') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }))
  importPreview(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('Attach a .csv or .xlsx file in the "file" field.');
    return this.bank.importPreview(user, lessonId, file.originalname, file.buffer);
  }
  @Post('quiz-authoring/lessons/:lessonId/import') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }))
  importCommit(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: { objectiveId?: string; newObjective?: string; publish?: string }, @UploadedFile() file?: { originalname: string; buffer: Buffer }) {
    if (!file) throw new BadRequestException('Attach a .csv or .xlsx file in the "file" field.');
    return this.bank.importCommit(user, lessonId, file.originalname, file.buffer, { objectiveId: body?.objectiveId || undefined, newObjective: body?.newObjective, publish: body?.publish !== 'false' });
  }
  @Get('quiz-authoring/lessons/:lessonId/assignment') quizAssignment(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) { return this.bank.quizAuthoringAssignment(user, lessonId); }
  @Get('quiz-authoring/lessons/:lessonId/preview') quizPreview(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) { return this.bank.quizAuthoringAssignment(user, lessonId, true); /* authorOrg already limits this to authors of the owning school (or a System Administrator) */ }
  @Post('quiz-authoring/lessons/:lessonId/assignment') createQuizAssignment(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: CreateQuizAssignmentDto) { return this.bank.createQuizAssignment(user, lessonId, body.title, body.instructions, body.passPercent); }
  @Patch('quiz-authoring/lessons/:lessonId/assignment/:assignmentId') updateQuizAssignment(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() body: UpdateQuizAssignmentDto) { return this.bank.updateQuizAssignment(user, lessonId, assignmentId, body.title, body.instructions, body.passPercent); }

  @Get('lessons/:lessonId/objectives') lessonObjectives(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) { return this.bank.lessonObjectives(user, lessonId); }
  @Post('quiz-authoring/lessons/:lessonId/questions') authorLessonQuestion(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: AuthorLessonQuestionDto) { return this.bank.authorLessonQuestion(user, lessonId, body); }
  @Post('lessons/:lessonId/objectives') createObjective(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: { description?: string }) { return this.bank.createObjective(user, lessonId, String(body?.description ?? '')); }
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
