import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { ExtendLabSessionDto, ForceEndLabSessionDto, StartLabSessionDto } from "./dto/lab-session.dto";
import { LabSessionService } from "./lab-session.service";

@ApiTags("Classroom Lab Session")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class LabSessionController {
  constructor(private readonly labSessions: LabSessionService) {}

  /** Robots allocated to the classroom with derived status (any member of the classroom). */
  @Get("classrooms/:classroomId/lab-robots")
  robots(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string) { return this.labSessions.classroomRobots(user, classroomId); }

  /** Open and recent Lab Sessions (Instructor of the classroom or School Admin of its organization). */
  @Get("classrooms/:classroomId/lab-sessions")
  list(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string) { return this.labSessions.classroomSessions(user, classroomId); }

  @Post("classrooms/:classroomId/lab-sessions")
  start(@CurrentUser() user: AuthenticatedUser, @Param("classroomId", ParseUUIDPipe) classroomId: string, @Body() dto: StartLabSessionDto) { return this.labSessions.start(user, classroomId, dto); }

  @Post("lab-sessions/:sessionId/extend")
  extend(@CurrentUser() user: AuthenticatedUser, @Param("sessionId", ParseUUIDPipe) sessionId: string, @Body() dto: ExtendLabSessionDto) { return this.labSessions.extend(user, sessionId, dto); }

  /** Stops the student's current run only; the reservation is preserved (see LabSessionService.stopExecution). */
  @Post("lab-sessions/:sessionId/stop-execution")
  stopExecution(@CurrentUser() user: AuthenticatedUser, @Param("sessionId", ParseUUIDPipe) sessionId: string) { return this.labSessions.stopExecution(user, sessionId); }

  @Post("lab-sessions/:sessionId/end")
  end(@CurrentUser() user: AuthenticatedUser, @Param("sessionId", ParseUUIDPipe) sessionId: string) { return this.labSessions.end(user, sessionId); }

  /** School Admin controlled recovery of an abandoned reservation. Same safe termination as End; requires confirmation and a reason. */
  @Post("lab-sessions/:sessionId/force-end")
  forceEnd(@CurrentUser() user: AuthenticatedUser, @Param("sessionId", ParseUUIDPipe) sessionId: string, @Body() dto: ForceEndLabSessionDto) { return this.labSessions.forceEnd(user, sessionId, dto); }
}
