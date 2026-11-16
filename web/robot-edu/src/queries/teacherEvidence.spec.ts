import {describe,expect,it} from 'vitest';
import {evidenceLabel,hasDataMetadata,runtimeNote,safeResult} from './teacherEvidence';

const evidence=(overrides:Record<string,unknown>={})=>({id:'e1',executionMode:'real_robot',method:'blockly',status:'succeeded',startedAt:null,endedAt:null,createdAt:'2026-10-25',provenance:{programVersionId:'v1'},result:{state:'succeeded'},metrics:{},events:[],artifacts:[],controlSession:null,demonstration:null,modelMetadata:null,...overrides} as never);
describe('teacher evidence presentation',()=>{
  it('distinguishes physical, schematic and demonstration evidence',()=>{expect(evidenceLabel('physical')).toBe('Physical execution');expect(evidenceLabel('schematic')).toBe('Schematic evaluation');expect(evidenceLabel('demonstration')).toBe('Demonstration');});
  it('sanitizes runtime failures',()=>{expect(safeResult(evidence({status:'failed',result:{errorCode:'private internal stack'}}))).toBe('Execution failed safely.');});
  it('does not invent dataset or model metadata',()=>{expect(hasDataMetadata(evidence())).toBe(false);expect(hasDataMetadata(evidence({demonstration:{datasets:[{id:'d'}]}}))).toBe(true);});
  it('shows the server-derived execution source and never defaults to physical',()=>{
    const run=(executionProvenance?:string)=>({executionMode:'real_robot',executionProvenance}) as never;
    expect(evidenceLabel('real_robot')).toBe('Robot execution');
    expect(runtimeNote(run('MOCK_RUNTIME'))?.text).toContain('did NOT move a physical robot');
    expect(runtimeNote(run('UNVERIFIED_RUNTIME'))?.text).toContain('not verified');
    expect(runtimeNote(run(undefined))?.text).toContain('not verified');
    expect(runtimeNote(run('PHYSICAL_ROBOT'))?.text).toContain('physical robot');
    expect(runtimeNote({executionMode:'schematic'} as never)).toBeNull();
  });
});
