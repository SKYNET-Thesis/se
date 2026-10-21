import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { CreateExperimentComparisonDto } from "./dto/create-experiment-comparison.dto";
import { CreateExperimentDto } from "./dto/create-experiment.dto";
import { ExperimentService } from "./experiment.service";
import { SymbolicEvaluationService } from "./symbolic-rules/symbolic-evaluation.service";
@ApiTags("Learning experiments") @ApiBearerAuth() @UseGuards(SupabaseAuthGuard) @Controller()
export class ExperimentController { constructor(private readonly experiments:ExperimentService,private readonly symbolicEvaluations:SymbolicEvaluationService) {}
 @Post("me/attempts/:attemptId/experiments") create(@CurrentUser()u:AuthenticatedUser,@Param("attemptId")id:string,@Body()dto:CreateExperimentDto){return this.experiments.create(u,id,dto)}
 @Get("me/experiments") mine(@CurrentUser()u:AuthenticatedUser){return this.experiments.mine(u)}
 @Get("me/experiments/:experimentId") detail(@CurrentUser()u:AuthenticatedUser,@Param("experimentId")id:string){return this.experiments.detail(u,id)}
 @Post("me/experiments/:experimentId/cancel") cancel(@CurrentUser()u:AuthenticatedUser,@Param("experimentId")id:string){return this.experiments.cancel(u,id)}
 @Post("me/experiments/:experimentId/run-schematic") runSchematic(@CurrentUser()u:AuthenticatedUser,@Param("experimentId")id:string){return this.experiments.runSchematic(u,id)}
 @Post("me/experiments/:experimentId/evaluate-symbolic") evaluateSymbolic(@CurrentUser()u:AuthenticatedUser,@Param("experimentId",ParseUUIDPipe)id:string){return this.symbolicEvaluations.evaluateOwnExperiment(u,id)}
 @Get("me/symbolic-evaluations") listSymbolicEvaluations(@CurrentUser()u:AuthenticatedUser){return this.symbolicEvaluations.mine(u)}
 @Get("me/symbolic-evaluations/:evaluationId") symbolicEvaluation(@CurrentUser()u:AuthenticatedUser,@Param("evaluationId",ParseUUIDPipe)id:string){return this.symbolicEvaluations.own(u,id)}
 @Get("me/experiments/:experimentId/result") result(@CurrentUser()u:AuthenticatedUser,@Param("experimentId")id:string){return this.experiments.result(u,id)}
 @Get("me/experiments/:experimentId/events") events(@CurrentUser()u:AuthenticatedUser,@Param("experimentId")id:string){return this.experiments.events(u,id)}
 @Get("me/experiments/:experimentId/artifacts") artifacts(@CurrentUser()u:AuthenticatedUser,@Param("experimentId")id:string){return this.experiments.artifacts(u,id)}
 @Post("me/experiment-comparisons") compare(@CurrentUser()u:AuthenticatedUser,@Body()dto:CreateExperimentComparisonDto){return this.experiments.compare(u,dto)}
}
