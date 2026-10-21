import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { LearningInsightsService } from "./learning-insights.service";

@ApiTags("Learning insight reads") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class LearningInsightsController {
  constructor(private readonly insights: LearningInsightsService) {}
  @Get("organizations/:organizationId") organization(@CurrentUser() u: AuthenticatedUser,@Param("organizationId",ParseUUIDPipe) id:string){return this.insights.organization(u,id)}
  @Get("organizations/:organizationId/classrooms") classrooms(@CurrentUser() u: AuthenticatedUser,@Param("organizationId",ParseUUIDPipe) id:string){return this.insights.organizationClassrooms(u,id)}
  @Get("classrooms/:classroomId/members") members(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomMembers(u,id)}
  @Get("classrooms/:classroomId/students") students(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomMembers(u,id,"student")}
  @Get("classrooms/:classroomId/instructors") instructors(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomMembers(u,id,"teacher")}
  @Get("classrooms/:classroomId/summary") summary(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomSummary(u,id)}
  @Get("assignments/:assignmentId") assignment(@CurrentUser()u:AuthenticatedUser,@Param("assignmentId",ParseUUIDPipe)id:string){return this.insights.assignment(u,id)}
  @Get("assignments/:assignmentId/rubric") rubric(@CurrentUser()u:AuthenticatedUser,@Param("assignmentId",ParseUUIDPipe)id:string){return this.insights.rubric(u,id)}
  @Get("challenges/:challengeId/assignments") challengeAssignments(@CurrentUser()u:AuthenticatedUser,@Param("challengeId",ParseUUIDPipe)id:string){return this.insights.challengeAssignments(u,id)}
  @Get("me/dashboard") dashboard(@CurrentUser()u:AuthenticatedUser){return this.insights.myDashboard(u)}
  @Get("me/learning-summary") learningSummary(@CurrentUser()u:AuthenticatedUser){return this.insights.myLearningSummary(u)}
  @Get("me/recent-activity") activity(@CurrentUser()u:AuthenticatedUser){return this.insights.myRecentActivity(u)}
  @Get("classrooms/:classroomId/dashboard") classroomDashboard(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomDashboard(u,id)}
  @Get("classrooms/:classroomId/progress-summary") progress(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomProgress(u,id)}
  @Get("classrooms/:classroomId/submission-summary") submissions(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomSubmissionSummary(u,id)}
  @Get("classrooms/:classroomId/activity") classroomActivity(@CurrentUser()u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe)id:string){return this.insights.classroomActivity(u,id)}
  @Get("me/attempts/:attemptId/workspace") workspace(@CurrentUser()u:AuthenticatedUser,@Param("attemptId",ParseUUIDPipe)id:string){return this.insights.attemptWorkspace(u,id)}
}
