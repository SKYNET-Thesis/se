import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { PaginationDto } from "./dto/pagination.dto";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { CreateQuizDeliveryDto } from './dto/create-quiz-delivery.dto';
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";
import { Body, Patch, Post } from "@nestjs/common";
import { LearningService } from "./learning.service";
import { CreateCourseDto, CreateLessonDto, LessonPrerequisitesDto, ReorderLessonsDto, UpdateCourseDto, UpdateLessonDto } from './dto/course-catalog.dto';
@ApiTags("Learning") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard)
@Controller()
export class LearningController {
 constructor(private readonly learning: LearningService) {}
 @Post('admin/courses') createGlobalCourse(@CurrentUser() u:AuthenticatedUser,@Body() dto:CreateCourseDto){return this.learning.createGlobalCourse(u,dto)}
 @Patch('admin/courses/:courseId') updateGlobalCourse(@CurrentUser() u:AuthenticatedUser,@Param('courseId',ParseUUIDPipe) id:string,@Body() dto:UpdateCourseDto){return this.learning.updateGlobalCourse(u,id,dto)}
 @Post('admin/courses/:courseId/publish') publishCourse(@CurrentUser() u:AuthenticatedUser,@Param('courseId',ParseUUIDPipe) id:string){return this.learning.publishCourse(u,id)}
 @Post('admin/courses/:courseId/archive') archiveCourse(@CurrentUser() u:AuthenticatedUser,@Param('courseId',ParseUUIDPipe) id:string){return this.learning.archiveCourse(u,id)}
 @Post('admin/courses/:courseId/lessons') createLesson(@CurrentUser() u:AuthenticatedUser,@Param('courseId',ParseUUIDPipe) id:string,@Body() dto:CreateLessonDto){return this.learning.createCourseLesson(u,id,dto)}
 @Patch('admin/lessons/:lessonId') updateLesson(@CurrentUser() u:AuthenticatedUser,@Param('lessonId',ParseUUIDPipe) id:string,@Body() dto:UpdateLessonDto){return this.learning.updateCourseLesson(u,id,dto)}
 @Post('admin/courses/:courseId/lessons/order') reorderLessons(@CurrentUser() u:AuthenticatedUser,@Param('courseId',ParseUUIDPipe) id:string,@Body() dto:ReorderLessonsDto){return this.learning.reorderCourseLessons(u,id,dto.orderedIds)}
 @Post('admin/lessons/:lessonId/prerequisites') prerequisites(@CurrentUser() u:AuthenticatedUser,@Param('lessonId',ParseUUIDPipe) id:string,@Body() dto:LessonPrerequisitesDto){return this.learning.setLessonPrerequisites(u,id,dto.prerequisiteLessonIds)}
 @Get("courses") courses(@CurrentUser() u:AuthenticatedUser,@Query() q:PaginationDto){return this.learning.courses(u,q)}
 @Get("courses/:courseId") course(@CurrentUser() u:AuthenticatedUser,@Param("courseId") id:string){return this.learning.course(u,id)}
 @Get("courses/:courseId/lessons") lessons(@CurrentUser() u:AuthenticatedUser,@Param("courseId") id:string){return this.learning.lessonsForCourse(u,id)}
 @Get("lessons/:lessonId") lesson(@CurrentUser() u:AuthenticatedUser,@Param("lessonId") id:string){return this.learning.lesson(u,id)}
 @Get("me/enrollments") enrollments(@CurrentUser() u:AuthenticatedUser,@Query() q:PaginationDto){return this.learning.enrollments(u,q)}
 @Get("me/classrooms") classrooms(@CurrentUser() u:AuthenticatedUser,@Query() q:PaginationDto){return this.learning.classrooms(u,q)}
 @Get("me/teaching-classrooms") teachingClassrooms(@CurrentUser() u:AuthenticatedUser){return this.learning.teachingClassrooms(u)}
 @Get("me/learning") myLearning(@CurrentUser() u:AuthenticatedUser){return this.learning.myLearning(u)}
 @Get("classrooms/:classroomId") classroom(@CurrentUser() u:AuthenticatedUser,@Param("classroomId") id:string){return this.learning.classroom(u,id)}
 @Get("classrooms/:classroomId/assignments") assignments(@CurrentUser() u:AuthenticatedUser,@Param("classroomId") id:string){return this.learning.assignments(u,id)}
 @Get("classrooms/:classroomId/delivery-options") deliveryOptions(@CurrentUser() u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe) id:string){return this.learning.deliveryOptions(u,id)}
 @Get("classrooms/:classroomId/published-quizzes") publishedQuizzes(@CurrentUser() u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe) id:string){return this.learning.publishedQuizzes(u,id)}
 @Post("classrooms/:classroomId/quiz-deliveries") createQuizDelivery(@CurrentUser() u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe) id:string,@Body() dto:CreateQuizDeliveryDto){return this.learning.createQuizDelivery(u,id,dto)}
 @Get("classroom-assignments/:classroomAssignmentId") assignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomAssignmentId",ParseUUIDPipe) id:string){return this.learning.assignment(u,id)}
 @Post("classrooms/:classroomId/assignments") createAssignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe) id:string,@Body() dto:CreateAssignmentDto){return this.learning.createAssignment(u,id,dto)}
 @Post("classrooms/:classroomId/assignments/:assignmentId/publish") publishAssignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe) classroomId:string,@Param("assignmentId",ParseUUIDPipe) assignmentId:string){return this.learning.publishAssignment(u,classroomId,assignmentId)}
 @Patch("classrooms/:classroomId/assignments/:assignmentId") updateAssignment(@CurrentUser() u:AuthenticatedUser,@Param("classroomId",ParseUUIDPipe) c:string,@Param("assignmentId",ParseUUIDPipe) a:string,@Body() dto:UpdateAssignmentDto){return this.learning.updateAssignment(u,c,a,dto)}
 @Post("classroom-assignments/:classroomAssignmentId/attempts") startAttempt(@CurrentUser() u:AuthenticatedUser,@Param("classroomAssignmentId",ParseUUIDPipe) id:string){return this.learning.startAttempt(u,id)}
 @Get("me/attempts") attempts(@CurrentUser() u:AuthenticatedUser){return this.learning.myAttempts(u)}
 @Get("me/attempts/:attemptId") attempt(@CurrentUser() u:AuthenticatedUser,@Param("attemptId",ParseUUIDPipe) id:string){return this.learning.myAttempt(u,id)}
}
