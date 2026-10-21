import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { CreateClassroomDto } from "./dto/create-classroom.dto";
import { UpsertClassroomMemberDto } from "./dto/upsert-classroom-member.dto";
import { EducationAdminService } from "./education-admin.service";

@ApiTags("Education administration")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("education-admin")
export class EducationAdminController {
  constructor(private readonly educationAdmin: EducationAdminService) {}

  @Get("organizations") organizations(@CurrentUser() user: AuthenticatedUser) { return this.educationAdmin.organizations(user); }
  @Get("organizations/:organizationId/members") members(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.educationAdmin.members(user, organizationId); }
  @Get("organizations/:organizationId/offerings") offerings(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.educationAdmin.offerings(user, organizationId); }
  @Get("organizations/:organizationId/classrooms") classrooms(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.educationAdmin.classrooms(user, organizationId); }
  @Get("organizations/:organizationId/classrooms/:classroomId/members") classroomMembers(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string) { return this.educationAdmin.classroomMembers(user, organizationId, classroomId); }
  @Post("organizations/:organizationId/classrooms") createClassroom(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: CreateClassroomDto) { return this.educationAdmin.createClassroom(user, organizationId, dto); }
  @Post("organizations/:organizationId/classrooms/:classroomId/members") upsertMember(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Body() dto: UpsertClassroomMemberDto) { return this.educationAdmin.upsertClassroomMember(user, organizationId, classroomId, dto); }
}
