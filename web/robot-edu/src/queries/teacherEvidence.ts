import type {ApiTeacherExperimentEvidence} from '../lib/api';

// The database value for a robot run is 'real_robot'. It is labelled "Robot execution", not "Physical", because only the runtime's own statement can show
// what drove the robot (see runtimeNote).
export const evidenceLabel=(mode:string)=>mode==='physical'?'Physical execution':mode==='real_robot'?'Robot execution':mode==='simulation'?'Simulation':mode==='offline_replay'?'Offline replay':mode==='demonstration'?'Demonstration':'Schematic evaluation';
/** The execution source as DERIVED BY THE SERVER (executionProvenance); the web never computes or accepts it from anywhere else. Null for non-robot evidence. */
export const runtimeNote=(evidence:ApiTeacherExperimentEvidence):{tone:'warn'|'info';text:string}|null=>{
  if(evidence.executionMode!=='real_robot')return null;
  switch(evidence.executionProvenance){
    case 'PHYSICAL_ROBOT':return {tone:'info',text:'Execution source: physical robot (declared by the runtime configuration).'};
    case 'MOCK_RUNTIME':return {tone:'warn',text:'Mock runtime: this run did NOT move a physical robot and does not satisfy a physical practical.'};
    default:return {tone:'warn',text:'The runtime did not state what drove the robot, so physical execution is not verified and the physical practical is not satisfied.'};
  }
};
export const safeResult=(evidence:ApiTeacherExperimentEvidence)=>{
  const error=typeof evidence.result?.errorCode==='string'&&evidence.result.errorCode?evidence.result.errorCode:null;
  if(error==='runtime_execution_timeout')return 'Execution exceeded its safe time limit.';
  if(error==='safety_stop_active'||error==='checkik_motion_not_authorized')return 'Robot safety stop was active.';
  if(error)return 'Execution failed safely.';
  return evidence.status;
};
export const hasDataMetadata=(evidence:ApiTeacherExperimentEvidence)=>Boolean(evidence.demonstration?.datasets.length||evidence.modelMetadata);
