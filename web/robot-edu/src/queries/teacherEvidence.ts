import type {ApiTeacherExperimentEvidence} from '../lib/api';

export const evidenceLabel=(mode:string)=>mode==='physical'?'Physical execution':mode==='demonstration'?'Demonstration':'Schematic evaluation';
export const safeResult=(evidence:ApiTeacherExperimentEvidence)=>{
  const error=typeof evidence.result?.errorCode==='string'&&evidence.result.errorCode?evidence.result.errorCode:null;
  if(error==='runtime_execution_timeout')return 'Execution exceeded its safe time limit.';
  if(error==='safety_stop_active'||error==='checkik_motion_not_authorized')return 'Robot safety stop was active.';
  if(error)return 'Execution failed safely.';
  return evidence.status;
};
export const hasDataMetadata=(evidence:ApiTeacherExperimentEvidence)=>Boolean(evidence.demonstration?.datasets.length||evidence.modelMetadata);
