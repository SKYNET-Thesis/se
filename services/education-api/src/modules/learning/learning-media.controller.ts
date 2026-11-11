import { Controller, Get, Param, ParseUUIDPipe, Post, Query, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { CreateLearningMediaUploadDto } from './dto/create-learning-media-upload.dto';
import { LearningMediaService } from './learning-media.service';

@ApiTags('Learning Media')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class LearningMediaController {
  constructor(private readonly media: LearningMediaService) {}

  @Post('admin/courses/:courseId/media/uploads')
  createUpload(@CurrentUser() user: AuthenticatedUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Body() body: CreateLearningMediaUploadDto) {
    return this.media.createUpload(user, courseId, body);
  }

  @Post('admin/media/:mediaId/complete')
  completeUpload(@CurrentUser() user: AuthenticatedUser, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.completeUpload(user, mediaId);
  }

  @Post('admin/media/:mediaId/fail')
  failUpload(@CurrentUser() user: AuthenticatedUser, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.failUpload(user, mediaId);
  }

  @Get('admin/courses/:courseId/media')
  list(@CurrentUser() user: AuthenticatedUser, @Param('courseId', ParseUUIDPipe) courseId: string, @Query('search') search = '', @Query('kind') kind = '') {
    return this.media.list(user, courseId, search, kind);
  }

  @Get('admin/media/:mediaId/url')
  authorUrl(@CurrentUser() user: AuthenticatedUser, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.authorUrl(user, mediaId);
  }

  @Get('activities/:activityId/media/:mediaId/url')
  activityUrl(@CurrentUser() user: AuthenticatedUser, @Param('activityId', ParseUUIDPipe) activityId: string, @Param('mediaId', ParseUUIDPipe) mediaId: string) {
    return this.media.activityUrl(user, activityId, mediaId);
  }
}
