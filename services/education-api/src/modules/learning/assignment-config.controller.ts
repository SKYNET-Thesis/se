import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../identity/auth/current-user.decorator';
import { AuthenticatedUser } from '../identity/auth/authenticated-user.interface';
import { SupabaseAuthGuard } from '../identity/auth/supabase-auth.guard';
import { AssignmentConfigService } from './assignment-config.service';
import { ReplaceRubricDto, UpdateScheduleDto } from './dto/assignment-config.dto';

@ApiTags('Assignment configuration') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class AssignmentConfigController {
  constructor(private readonly config: AssignmentConfigService) {}
  @Get('classrooms/:classroomId/assignments/:assignmentId/rubric') rubric(@CurrentUser() u: AuthenticatedUser, @Param('classroomId', ParseUUIDPipe) c: string, @Param('assignmentId', ParseUUIDPipe) a: string) { return this.config.getRubric(u, c, a); }
  @Put('classrooms/:classroomId/assignments/:assignmentId/rubric') replaceRubric(@CurrentUser() u: AuthenticatedUser, @Param('classroomId', ParseUUIDPipe) c: string, @Param('assignmentId', ParseUUIDPipe) a: string, @Body() dto: ReplaceRubricDto) { return this.config.replaceRubric(u, c, a, dto); }
  @Patch('classrooms/:classroomId/assignments/:assignmentId/schedule') schedule(@CurrentUser() u: AuthenticatedUser, @Param('classroomId', ParseUUIDPipe) c: string, @Param('assignmentId', ParseUUIDPipe) a: string, @Body() dto: UpdateScheduleDto) { return this.config.updateSchedule(u, c, a, dto); }
}
