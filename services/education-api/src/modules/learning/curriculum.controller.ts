import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { CurriculumService } from './curriculum.service';
import { CreateActivityDto, SaveProgrammingAssignmentDto, CreateSectionDto, CurriculumStatusDto, ReorderCurriculumDto, UpdateActivityDto, UpdateSectionDto } from './dto/curriculum.dto';

@ApiTags('Curriculum')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get('lessons/:lessonId/sections')
  lessonSections(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.curriculum.lessonSections(user, lessonId);
  }

  @Get('author/lessons/:lessonId/sections')
  authorSections(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string) {
    return this.curriculum.authorSections(user, lessonId);
  }

  @Post('author/lessons/:lessonId/sections')
  createSection(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: CreateSectionDto) {
    return this.curriculum.createSection(user, lessonId, body);
  }

  @Patch('author/sections/:sectionId')
  updateSection(@CurrentUser() user: AuthenticatedUser, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() body: UpdateSectionDto) {
    return this.curriculum.updateSection(user, sectionId, body);
  }

  @Put('author/lessons/:lessonId/sections/order')
  reorderSections(@CurrentUser() user: AuthenticatedUser, @Param('lessonId', ParseUUIDPipe) lessonId: string, @Body() body: ReorderCurriculumDto) {
    return this.curriculum.reorderSections(user, lessonId, body.orderedIds);
  }

  @Post('author/sections/:sectionId/status')
  sectionStatus(@CurrentUser() user: AuthenticatedUser, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() body: CurriculumStatusDto) {
    return this.curriculum.setSectionStatus(user, sectionId, body.status);
  }

  @Post('author/sections/:sectionId/activities')
  createActivity(@CurrentUser() user: AuthenticatedUser, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() body: CreateActivityDto) {
    return this.curriculum.createActivity(user, sectionId, body);
  }

  @Patch('author/activities/:activityId')
  updateActivity(@CurrentUser() user: AuthenticatedUser, @Param('activityId', ParseUUIDPipe) activityId: string, @Body() body: UpdateActivityDto) {
    return this.curriculum.updateActivity(user, activityId, body);
  }

  @Put('author/sections/:sectionId/activities/order')
  reorderActivities(@CurrentUser() user: AuthenticatedUser, @Param('sectionId', ParseUUIDPipe) sectionId: string, @Body() body: ReorderCurriculumDto) {
    return this.curriculum.reorderActivities(user, sectionId, body.orderedIds);
  }

  @Post('author/activities/:activityId/status')
  activityStatus(@CurrentUser() user: AuthenticatedUser, @Param('activityId', ParseUUIDPipe) activityId: string, @Body() body: CurriculumStatusDto) {
    return this.curriculum.setActivityStatus(user, activityId, body.status);
  }

  @Get('author/activities/:activityId/programming-assignment')
  programmingAssignment(@CurrentUser() user: AuthenticatedUser, @Param('activityId', ParseUUIDPipe) activityId: string) {
    return this.curriculum.programmingAssignment(user, activityId);
  }

  @Put('author/activities/:activityId/programming-assignment')
  saveProgrammingAssignment(@CurrentUser() user: AuthenticatedUser, @Param('activityId', ParseUUIDPipe) activityId: string, @Body() body: SaveProgrammingAssignmentDto) {
    return this.curriculum.saveProgrammingAssignment(user, activityId, body);
  }
}
