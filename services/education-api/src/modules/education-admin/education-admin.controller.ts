import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { CreateClassroomDto } from "./dto/create-classroom.dto";
import { AllocateClassroomRobotDto } from "./dto/allocate-classroom-robot.dto";
import { UpsertClassroomMemberDto } from "./dto/upsert-classroom-member.dto";
import { ImportSchoolUsersDto } from "./dto/import-school-users.dto";
import { MemberCandidateQueryDto, SchoolPeopleQueryDto } from "./dto/school-admin-query.dto";
import { EducationAdminService } from "./education-admin.service";
import { SchoolAdminQueryService } from "./school-admin-query.service";
import { ImportClassroomStudentsDto } from "./dto/import-classroom-students.dto";
import { ClassroomStudentImportService } from "./classroom-student-import.service";

@ApiTags("Education administration")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller("education-admin")
export class EducationAdminController {
  constructor(private readonly educationAdmin: EducationAdminService, private readonly queries: SchoolAdminQueryService, private readonly classroomStudentImports: ClassroomStudentImportService) {}

  @Get("organizations") organizations(@CurrentUser() user: AuthenticatedUser) { return this.educationAdmin.organizations(user); }
  @Get("organizations/:organizationId/members") members(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.educationAdmin.members(user, organizationId); }
  @Get("organizations/:organizationId/overview") overview(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.queries.overview(user, organizationId); }
  @Get("organizations/:organizationId/people") people(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Query() query: SchoolPeopleQueryDto) { return this.queries.people(user, organizationId, query); }
  @Get("organizations/:organizationId/offerings") offerings(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.queries.offerings(user, organizationId); }
  @Get("organizations/:organizationId/classrooms") classrooms(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string) { return this.queries.classrooms(user, organizationId); }
  @Get("organizations/:organizationId/classrooms/:classroomId/members") classroomMembers(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string) { return this.queries.classroomMembers(user, organizationId, classroomId); }
  @Get("organizations/:organizationId/classrooms/:classroomId/member-candidates") memberCandidates(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Query() query: MemberCandidateQueryDto) { return this.queries.memberCandidates(user, organizationId, classroomId, query); }
  @Post("organizations/:organizationId/classrooms") createClassroom(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: CreateClassroomDto) { return this.educationAdmin.createClassroom(user, organizationId, dto); }
  @Post("organizations/:organizationId/user-imports") importUsers(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: ImportSchoolUsersDto) { return this.educationAdmin.importUsers(user, organizationId, dto); }
  @Post("organizations/:organizationId/classrooms/:classroomId/members") upsertMember(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Body() dto: UpsertClassroomMemberDto) { return this.educationAdmin.upsertClassroomMember(user, organizationId, classroomId, dto); }
  @Post("organizations/:organizationId/classrooms/:classroomId/student-imports/preview") previewClassroomStudents(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Body() dto: ImportClassroomStudentsDto) { return this.classroomStudentImports.preview(user, organizationId, classroomId, dto); }
  @Post("organizations/:organizationId/classrooms/:classroomId/student-imports") confirmClassroomStudents(@CurrentUser() user: AuthenticatedUser, @Param("organizationId", ParseUUIDPipe) organizationId: string, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Body() dto: ImportClassroomStudentsDto) { return this.classroomStudentImports.confirm(user, organizationId, classroomId, dto); }
  @Get("classrooms/:classroomId/eligible-robots") eligibleRobots(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string) { return this.educationAdmin.eligibleRobots(user, classroomId); }
  @Put("classrooms/:classroomId/robot-allocation") allocateRobot(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Body() dto: AllocateClassroomRobotDto) { return this.educationAdmin.allocateRobot(user, classroomId, dto); }
}
