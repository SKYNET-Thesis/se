import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../identity/auth/current-user.decorator";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { SupabaseAuthGuard } from "../identity/auth/supabase-auth.guard";
import { PaginationDto } from "../learning/dto/pagination.dto";
import { MetadataService } from "./metadata.service";

@ApiTags("Learning metadata")
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard)
@Controller()
export class MetadataController {
  constructor(private readonly metadata: MetadataService) {}

  @Get("learning-levels") levels() { return this.metadata.levels(); }
  @Get("competencies") competencies(@Query() page: PaginationDto) { return this.metadata.competencies(page); }
  @Get("me/competencies") myCompetencies(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.myCompetencies(user, page); }
  @Get("me/competencies/:competencyId") myCompetency(@CurrentUser() user: AuthenticatedUser, @Param("competencyId") id: string) { return this.metadata.myCompetency(user, id); }

  @Get("course-offerings") offerings(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.offerings(user, page); }
  @Get("course-offerings/:offeringId") offering(@CurrentUser() user: AuthenticatedUser, @Param("offeringId") id: string) { return this.metadata.offering(user, id); }
  @Get("classrooms/:classroomId/course") classroomCourse(@CurrentUser() user: AuthenticatedUser, @Param("classroomId") id: string) { return this.metadata.classroomCourse(user, id); }

  @Get("challenges") challenges(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.challenges(user, page); }
  @Get("challenges/:challengeId") challenge(@CurrentUser() user: AuthenticatedUser, @Param("challengeId") id: string) { return this.metadata.challenge(user, id); }
  @Get("challenges/:challengeId/objects") challengeObjects(@CurrentUser() user: AuthenticatedUser, @Param("challengeId") id: string) { return this.metadata.challengeObjects(user, id); }
  @Get("challenges/:challengeId/conditions") challengeConditions(@CurrentUser() user: AuthenticatedUser, @Param("challengeId") id: string) { return this.metadata.challengeConditions(user, id); }

  @Get("benchmark-tasks") benchmarkTasks(@Query() page: PaginationDto) { return this.metadata.benchmarkTasks(page); }
  @Get("benchmark-tasks/:taskId") benchmarkTask(@Param("taskId") id: string) { return this.metadata.benchmarkTask(id); }

  @Get("me/demonstrations") demonstrations(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.demonstrations(user, page); }
  @Get("me/demonstrations/:demonstrationId") demonstration(@CurrentUser() user: AuthenticatedUser, @Param("demonstrationId") id: string) { return this.metadata.demonstration(user, id); }
  @Get("me/demonstrations/:demonstrationId/segments") demonstrationSegments(@CurrentUser() user: AuthenticatedUser, @Param("demonstrationId") id: string) { return this.metadata.demonstrationSegments(user, id); }
  @Get("me/demonstrations/:demonstrationId/annotations") demonstrationAnnotations(@CurrentUser() user: AuthenticatedUser, @Param("demonstrationId") id: string) { return this.metadata.demonstrationAnnotations(user, id); }
  @Get("me/demonstrations/:demonstrationId/observation-configuration") demonstrationObservationConfiguration(@CurrentUser() user: AuthenticatedUser, @Param("demonstrationId") id: string) { return this.metadata.demonstrationObservationConfiguration(user, id); }
  @Get("me/demonstrations/:demonstrationId/dataset-versions") demonstrationDatasets(@CurrentUser() user: AuthenticatedUser, @Param("demonstrationId") id: string) { return this.metadata.demonstrationDatasets(user, id); }

  @Get("me/dataset-versions") datasetVersions(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.datasetVersions(user, page); }
  @Get("me/dataset-versions/:datasetVersionId") datasetVersion(@CurrentUser() user: AuthenticatedUser, @Param("datasetVersionId") id: string) { return this.metadata.datasetVersion(user, id); }
  @Get("me/dataset-versions/:datasetVersionId/episodes") datasetEpisodes(@CurrentUser() user: AuthenticatedUser, @Param("datasetVersionId") id: string) { return this.metadata.datasetEpisodes(user, id); }
  @Get("me/dataset-versions/:datasetVersionId/summary") datasetSummary(@CurrentUser() user: AuthenticatedUser, @Param("datasetVersionId") id: string) { return this.metadata.datasetSummary(user, id); }
  @Get("me/dataset-versions/:datasetVersionId/episodes/:episodeId") datasetEpisode(@CurrentUser() user: AuthenticatedUser, @Param("datasetVersionId") datasetId: string, @Param("episodeId") episodeId: string) { return this.metadata.datasetEpisode(user, datasetId, episodeId); }
  @Get("me/dataset-versions/:datasetVersionId/training-runs") datasetTrainingRuns(@CurrentUser() user: AuthenticatedUser, @Param("datasetVersionId") id: string) { return this.metadata.datasetTrainingRuns(user, id); }

  @Get("me/training-runs") trainingRuns(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.trainingRuns(user, page); }
  @Get("me/training-runs/:trainingRunId") trainingRun(@CurrentUser() user: AuthenticatedUser, @Param("trainingRunId") id: string) { return this.metadata.trainingRun(user, id); }
  @Get("me/training-runs/:trainingRunId/checkpoints") trainingCheckpoints(@CurrentUser() user: AuthenticatedUser, @Param("trainingRunId") id: string) { return this.metadata.trainingCheckpoints(user, id); }
  @Get("me/training-runs/:trainingRunId/checkpoints/:checkpointId") trainingCheckpoint(@CurrentUser() user: AuthenticatedUser, @Param("trainingRunId") runId: string, @Param("checkpointId") checkpointId: string) { return this.metadata.trainingCheckpoint(user, runId, checkpointId); }
  @Get("me/training-runs/:trainingRunId/metrics") trainingMetrics(@CurrentUser() user: AuthenticatedUser, @Param("trainingRunId") id: string) { return this.metadata.trainingMetrics(user, id); }
  @Get("me/training-runs/:trainingRunId/dataset-version") trainingDataset(@CurrentUser() user: AuthenticatedUser, @Param("trainingRunId") id: string) { return this.metadata.trainingDataset(user, id); }

  @Get("ai-models") models(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.models(user, page); }
  @Get("ai-models/:modelId") model(@CurrentUser() user: AuthenticatedUser, @Param("modelId") id: string) { return this.metadata.model(user, id); }
  @Get("ai-models/:modelId/checkpoints") modelCheckpoints(@CurrentUser() user: AuthenticatedUser, @Param("modelId") id: string) { return this.metadata.modelCheckpoints(user, id); }
  @Get("model-checkpoints/:checkpointId") checkpoint(@CurrentUser() user: AuthenticatedUser, @Param("checkpointId") id: string) { return this.metadata.checkpoint(user, id); }
  @Get("model-checkpoints/:checkpointId/model") checkpointModel(@CurrentUser() user: AuthenticatedUser, @Param("checkpointId") id: string) { return this.metadata.checkpointModel(user, id); }

  @Get("me/evaluation-runs") evaluationRuns(@CurrentUser() user: AuthenticatedUser, @Query() page: PaginationDto) { return this.metadata.evaluationRuns(user, page); }
  @Get("me/evaluation-runs/:evaluationRunId") evaluationRun(@CurrentUser() user: AuthenticatedUser, @Param("evaluationRunId") id: string) { return this.metadata.evaluationRun(user, id); }
  @Get("me/evaluation-runs/:evaluationRunId/metrics") evaluationMetrics(@CurrentUser() user: AuthenticatedUser, @Param("evaluationRunId") id: string) { return this.metadata.evaluationMetrics(user, id); }
  @Get("me/evaluation-runs/:evaluationRunId/benchmark") evaluationBenchmark(@CurrentUser() user: AuthenticatedUser, @Param("evaluationRunId") id: string) { return this.metadata.evaluationBenchmark(user, id); }
  @Get("me/evaluation-runs/:evaluationRunId/checkpoint") evaluationCheckpoint(@CurrentUser() user: AuthenticatedUser, @Param("evaluationRunId") id: string) { return this.metadata.evaluationCheckpoint(user, id); }

  @Get("me/experiments/:experimentId/vla-interactions") vlaInteractions(@CurrentUser() user: AuthenticatedUser, @Param("experimentId") id: string) { return this.metadata.vlaInteractions(user, id); }
  @Get("me/vla-interactions/:interactionId") vlaInteraction(@CurrentUser() user: AuthenticatedUser, @Param("interactionId") id: string) { return this.metadata.vlaInteraction(user, id); }
  @Get("me/vla-interactions/:interactionId/action-steps") vlaActionSteps(@CurrentUser() user: AuthenticatedUser, @Param("interactionId") id: string) { return this.metadata.vlaActionSteps(user, id); }
  @Get("me/vla-interactions/:interactionId/summary") vlaSummary(@CurrentUser() user: AuthenticatedUser, @Param("interactionId") id: string) { return this.metadata.vlaSummary(user, id); }
  @Get("me/vla-interactions/:interactionId/experiment") vlaExperiment(@CurrentUser() user: AuthenticatedUser, @Param("interactionId") id: string) { return this.metadata.vlaExperiment(user, id); }
}
