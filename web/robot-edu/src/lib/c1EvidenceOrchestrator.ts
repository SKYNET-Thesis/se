import type { ApiExperiment, ApiProgramVersion, ApiSubmission, ApiSymbolicEvaluation } from './api';

export type EvidenceStage='none'|'program_saved'|'version_created'|'submission_persisted'|'experiment_created'|'experiment_run'|'evaluation_persisted';
export class C1EvidenceError extends Error { constructor(message:string,readonly completedStage:EvidenceStage){super(message);} }
interface Dependencies { saveProgram:()=>Promise<unknown>;createVersion:()=>Promise<{id:string}>;submit:(versionId:string)=>Promise<ApiSubmission>;createExperiment:(versionId:string)=>Promise<ApiExperiment>;runExperiment:(experimentId:string)=>Promise<unknown>;evaluate:(experimentId:string)=>Promise<ApiSymbolicEvaluation>; }

export async function runC1Evidence(deps:Dependencies){let completedStage:EvidenceStage='none';try{await deps.saveProgram();completedStage='program_saved';const version=await deps.createVersion();completedStage='version_created';const submission=await deps.submit(version.id);completedStage='submission_persisted';const experiment=await deps.createExperiment(version.id);completedStage='experiment_created';if(experiment.status==='running')throw new Error('Schematic evaluation is already running. Try again shortly.');if(experiment.status==='pending')await deps.runExperiment(experiment.id);completedStage='experiment_run';const evaluation=await deps.evaluate(experiment.id);completedStage='evaluation_persisted';if(evaluation.programVersionId!==version.id)throw new Error('Persisted evaluation does not match the submitted ProgramVersion.');return{version,submission,experiment,evaluation,completedStage};}catch(error){throw new C1EvidenceError(error instanceof Error?error.message:'C1 evidence could not be persisted.',completedStage);}}

export function recoverEvidence(versions:ApiProgramVersion[],submissions:ApiSubmission[],experiments:ApiExperiment[],evaluations:ApiSymbolicEvaluation[]){
  const version=[...versions].sort((a,b)=>b.version_number-a.version_number)[0];if(!version)return null;
  const submission=submissions.find(item=>item.program_version_id===version.id);if(!submission)return null;const experiment=experiments.find(item=>item.input_snapshot?.programVersionId===version.id);if(!experiment)return null;const evaluation=evaluations.find(item=>item.experimentId===experiment.id&&item.programVersionId===version.id);if(evaluation)return{version,submission,experiment,evaluation};
  return null;
}
