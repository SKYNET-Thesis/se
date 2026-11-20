import { Controller, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { UnpublishService } from "./unpublish.service";

@ApiTags("Content lifecycle") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class UnpublishController {
  constructor(private readonly unpublish: UnpublishService) {}
  @Post("admin/courses/:courseId/unpublish") course(@CurrentUser() user: AuthenticatedUser, @Param("courseId", ParseUUIDPipe) courseId: string) { return this.unpublish.unpublishCourse(user, courseId); }
  @Post("classrooms/:classroomId/assignments/:assignmentId/unpublish") assignment(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Param("assignmentId", ParseUUIDPipe) assignmentId: string) { return this.unpublish.unpublishAssignment(user, classroomId, assignmentId); }
}
