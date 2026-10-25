import { Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { PhysicalExecutionService } from "./physical-execution.service";

@ApiTags("Physical execution preparation")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class PhysicalExecutionController {
  constructor(private readonly physicalExecutions: PhysicalExecutionService) {}

  @Get("me/attempts/:attemptId/physical-execution-eligibility")
  eligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    return this.physicalExecutions.eligibility(user, attemptId);
  }

  @Post("me/attempts/:attemptId/physical-executions")
  prepare(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    return this.physicalExecutions.prepare(user, attemptId);
  }

  @Post("me/attempts/:attemptId/physical-executions/start")
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    return this.physicalExecutions.start(user, attemptId);
  }

  @Get("me/physical-executions/:experimentId")
  status(
    @CurrentUser() user: AuthenticatedUser,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.physicalExecutions.status(user, experimentId);
  }

  @Post("me/physical-executions/:experimentId/stop")
  stop(
    @CurrentUser() user: AuthenticatedUser,
    @Param("experimentId", ParseUUIDPipe) experimentId: string,
  ) {
    return this.physicalExecutions.stop(user, experimentId);
  }

  @Get("me/attempts/:attemptId/physical-executions/active")
  active(
    @CurrentUser() user: AuthenticatedUser,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    return this.physicalExecutions.active(user, attemptId);
  }
}
