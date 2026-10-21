import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { LearningController } from "./learning.controller";
import { LearningScopeService } from "./learning-scope.service";
import { LearningService } from "./learning.service";
import { ProgrammingController } from "./programming.controller";
import { ProgrammingService } from "./programming.service";
import { AssessmentController } from "./assessment.controller";
import { AssessmentService } from "./assessment.service";
import { ExperimentController } from "./experiment.controller";
import { ExperimentService } from "./experiment.service";
import { SchematicEngineService } from "./schematic-engine.service";
import { SymbolicRuleCompilerService } from "./symbolic-rules/symbolic-rule-compiler.service";
import { SymbolicRuleEvaluatorService } from "./symbolic-rules/symbolic-rule-evaluator.service";
import { SymbolicEvaluationPreparationService } from "./symbolic-rules/symbolic-evaluation-preparation.service";
import { SymbolicEvaluationService } from "./symbolic-rules/symbolic-evaluation.service";
import { LearningInsightsController } from "./learning-insights.controller";
import { LearningInsightsService } from "./learning-insights.service";
import { VrLessonController } from "./vr-lesson.controller";
import { VrLessonService } from "./vr-lesson.service";
import { DemonstrationLessonController } from "./demonstration-lesson.controller";
import { DemonstrationLessonService } from "./demonstration-lesson.service";
@Module({imports:[IdentityModule],controllers:[LearningController,ProgrammingController,AssessmentController,ExperimentController,LearningInsightsController,VrLessonController,DemonstrationLessonController],providers:[LearningService,LearningScopeService,ProgrammingService,AssessmentService,ExperimentService,SchematicEngineService,SymbolicRuleCompilerService,SymbolicRuleEvaluatorService,SymbolicEvaluationPreparationService,SymbolicEvaluationService,LearningInsightsService,VrLessonService,DemonstrationLessonService]})
export class LearningModule {}
