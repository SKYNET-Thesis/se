import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { PaginationDto } from "./dto/pagination.dto";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";
import { Body, Patch, Post } from "@nestjs/common";
import { LearningService } from "./learning.service";
@ApiTags("Learning") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard)
@Controller()
export class LearningController {
 constructor(private readonly learning: LearningService) {}
 @Get("courses") courses(@CurrentUser() u:AuthenticatedUser,@Query() q:PaginationDto){return this.learning.courses(u,q)}
 @Get("courses/:courseId") course(@CurrentUser() u:AuthenticatedUser,@Param("courseId") id:string){return this.learning.course(u,id)}
 @Get("courses/:courseId/lessons") lessons(@CurrentUser() u:AuthenticatedUser,@Param("courseId") id:string){return this.learning.lessonsForCourse(u,id)}
 @Get("lessons/:lessonId") lesson(@CurrentUser() u:AuthenticatedUser,@Param("lessonId") id:string){return this.learning.lesson(u,id)}
 @Get("me/enrollments") enrollments(@CurrentUser() u:AuthenticatedUser,@Query() q:PaginationDto){return this.learning.enrollments(u,q)}
 @Get("me/classrooms") classrooms(@CurrentUser() u:AuthenticatedUser,@Query() q:PaginationDto){return this.learning.classrooms(u,q)}
 @Get("classrooms/:classroomId") classroom(@CurrentUser() u:AuthenticatedUser,@Param("classroomId") id:string){return this.learning.classroom(u,id)}
 @Get("classrooms/:classroomId/assignments") assignments(@CurrentUser() u:AuthenticatedUser,@Param("classroomId") id:string){return this.learning.assignments(u,id)}
 @Get("classroom-assignments/:classroomAssignmentId") assignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomAssignmentId",ParseUUIDPipe) id:string){return this.learning.assignment(u,id)}
 @Post("classrooms/:classroomId/assignments") createAssignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomId") id:string,@Body() dto:CreateAssignmentDto){return this.learning.createAssignment(u,id,dto)}
 @Patch("classrooms/:classroomId/assignments/:assignmentId") updateAssignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomId") c:string,@Param("assignmentId") a:string,@Body() dto:UpdateAssignmentDto){return this.learning.updateAssignment(u,c,a,dto)}
 @Post("classroom-assignments/:classroomAssignmentId/attempts") startAttempt(@CurrentUser() u:AuthenticatedUser,@Param("classroomAssignmentId",ParseUUIDPipe) id:string){return this.learning.startAttempt(u,id)}
 @Get("me/attempts") attempts(@CurrentUser() u:AuthenticatedUser){return this.learning.myAttempts(u)}
 @Get("me/attempts/:attemptId") attempt(@CurrentUser() u:AuthenticatedUser,@Param("attemptId",ParseUUIDPipe) id:string){return this.learning.myAttempt(u,id)}
}
