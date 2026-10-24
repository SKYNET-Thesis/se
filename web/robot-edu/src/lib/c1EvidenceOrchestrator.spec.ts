import { describe, expect, it, vi } from 'vitest';
import { recoverEvidence, runC1Evidence } from './c1EvidenceOrchestrator';

describe('C1 evidence orchestration', () => {
  it('persists each stage in order and returns only backend evaluation evidence', async () => {
    const calls:string[]=[]; const deps={ saveProgram:vi.fn(async()=>{calls.push('program');}), createVersion:vi.fn(async()=>{calls.push('version');return{id:'v2'}}), submit:vi.fn(async()=>{calls.push('submission');return{id:'s1',program_version_id:'v2',status:'submitted'}}), createExperiment:vi.fn(async()=>{calls.push('experiment');return{id:'e1',status:'pending',execution_mode:'schematic'}}), runExperiment:vi.fn(async()=>{calls.push('run');}), evaluate:vi.fn(async()=>{calls.push('evaluation');return{id:'ev1',experimentId:'e1',programVersionId:'v2',verdict:'passed'} as never})};
    const result=await runC1Evidence(deps as never);
    expect(calls).toEqual(['program','version','submission','experiment','run','evaluation']);
    expect(result.evaluation).toMatchObject({verdict:'passed',programVersionId:'v2'});
  });
  it('reports submission persisted when evaluation fails and never fabricates pass', async () => {
    const deps={saveProgram:vi.fn(),createVersion:vi.fn(async()=>({id:'v2'})),submit:vi.fn(async()=>({id:'s1',program_version_id:'v2'})),createExperiment:vi.fn(async()=>({id:'e1'})),runExperiment:vi.fn(),evaluate:vi.fn(async()=>{throw new Error('evaluation offline')})};
    await expect(runC1Evidence(deps as never)).rejects.toMatchObject({completedStage:'experiment_run',message:'evaluation offline'});
  });
  it('reuses a succeeded experiment without attempting an invalid second run',async()=>{const runExperiment=vi.fn();const deps={saveProgram:vi.fn(),createVersion:vi.fn(async()=>({id:'v2'})),submit:vi.fn(async()=>({id:'s1',program_version_id:'v2'})),createExperiment:vi.fn(async()=>({id:'e1',status:'succeeded',execution_mode:'schematic'})),runExperiment,evaluate:vi.fn(async()=>({id:'ev2',experimentId:'e1',programVersionId:'v2',verdict:'passed'}))};await runC1Evidence(deps as never);expect(runExperiment).not.toHaveBeenCalled();});
  it('restores an evaluation only when it matches the submitted ProgramVersion', () => {
    const recovered=recoverEvidence([{id:'v2',version_number:2,robot_program:{}}],[{id:'s1',program_version_id:'v2',status:'submitted'}],[{id:'e1',status:'succeeded',execution_mode:'schematic',input_snapshot:{programVersionId:'v2'}}],[{id:'old',experimentId:'e1',programVersionId:'v1',verdict:'passed'},{id:'ev2',experimentId:'e1',programVersionId:'v2',verdict:'failed'}] as never);
    expect(recovered?.evaluation).toMatchObject({id:'ev2',verdict:'failed'});
  });
  it('does not fall back to old evidence when the latest version is incomplete',()=>{expect(recoverEvidence([{id:'v2',version_number:2,robot_program:{}},{id:'v1',version_number:1,robot_program:{}}],[{id:'s1',program_version_id:'v1',status:'submitted'}],[{id:'e1',status:'succeeded',execution_mode:'schematic',input_snapshot:{programVersionId:'v1'}}],[{id:'ev1',experimentId:'e1',programVersionId:'v1',verdict:'passed'}] as never)).toBeNull();});
  it('does not rerun an experiment already running',async()=>{const runExperiment=vi.fn();const deps={saveProgram:vi.fn(),createVersion:vi.fn(async()=>({id:'v2'})),submit:vi.fn(async()=>({id:'s1',program_version_id:'v2'})),createExperiment:vi.fn(async()=>({id:'e1',status:'running',execution_mode:'schematic'})),runExperiment,evaluate:vi.fn()};await expect(runC1Evidence(deps as never)).rejects.toMatchObject({completedStage:'experiment_created'});expect(runExperiment).not.toHaveBeenCalled();});
});
