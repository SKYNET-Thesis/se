import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { CreateSubmissionFileUploadDto } from './dto/create-submission-file-upload.dto';
import { SubmissionFilesService } from './submission-files.service';

@ApiTags('Learning submission files') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard)
@Controller()
export class SubmissionFilesController {
  constructor(private readonly files: SubmissionFilesService) {}

  @Post('me/attempts/:attemptId/files')
  createUpload(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Body() dto: CreateSubmissionFileUploadDto) {
    return this.files.createUpload(user, attemptId, dto);
  }
  @Post('me/attempts/:attemptId/files/:fileId/complete')
  complete(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.files.completeUpload(user, attemptId, fileId);
  }
  @Delete('me/attempts/:attemptId/files/:fileId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.files.remove(user, attemptId, fileId);
  }
  @Get('me/attempts/:attemptId/files')
  list(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.files.list(user, attemptId);
  }
  @Get('me/attempts/:attemptId/files/:fileId/url')
  url(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.files.downloadUrl(user, attemptId, fileId);
  }
  @Get('attempts/:attemptId/files')
  teacherList(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string) {
    return this.files.teacherList(user, attemptId);
  }
  @Get('attempts/:attemptId/files/:fileId/url')
  teacherUrl(@CurrentUser() user: AuthenticatedUser, @Param('attemptId', ParseUUIDPipe) attemptId: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return this.files.teacherDownloadUrl(user, attemptId, fileId);
  }
}
