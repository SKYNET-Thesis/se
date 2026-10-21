import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { AssessSubmissionDto } from "./dto/assess-submission.dto";
import { CreateFeedbackDto } from "./dto/create-feedback.dto";
import { CreateReflectionDto } from "./dto/create-reflection.dto";
import { AssessmentService } from "./assessment.service";

@ApiTags("Learning assessment") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard)
@Controller()
export class AssessmentController {
  constructor(private readonly assessments: AssessmentService) {}
  @Get("classrooms/:classroomId/submissions") list(@CurrentUser() user: AuthenticatedUser,@Param("classroomId") id:string){return this.assessments.classroomSubmissions(user,id)}
  @Get("submissions/:submissionId") detail(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string){return this.assessments.instructorSubmission(user,id)}
  @Get("submissions/:submissionId/assessment") assessment(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string){return this.assessments.assessment(user,id)}
  @Get("submissions/:submissionId/feedback") instructorFeedback(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string){return this.assessments.instructorFeedback(user,id)}
  @Post("submissions/:submissionId/assessment") assess(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string,@Body() dto:AssessSubmissionDto){return this.assessments.assess(user,id,dto)}
  @Post("submissions/:submissionId/feedback") feedback(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string,@Body() dto:CreateFeedbackDto){return this.assessments.feedback(user,id,dto)}
  @Get("me/submissions") mine(@CurrentUser() user: AuthenticatedUser){return this.assessments.mySubmissions(user)}
  @Get("me/submissions/:submissionId") mySubmission(@CurrentUser() user: AuthenticatedUser,@Param("submissionId",ParseUUIDPipe) id:string){return this.assessments.mySubmission(user,id)}
  @Get("me/submissions/:submissionId/feedback") myFeedback(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string){return this.assessments.myFeedback(user,id)}
  @Get("me/submissions/:submissionId/reflections") reflections(@CurrentUser() user: AuthenticatedUser,@Param("submissionId",ParseUUIDPipe) id:string){return this.assessments.myReflections(user,id)}
  @Post("me/submissions/:submissionId/reflections") reflection(@CurrentUser() user: AuthenticatedUser,@Param("submissionId") id:string,@Body() dto:CreateReflectionDto){return this.assessments.createReflection(user,id,dto)}
}
