import {DemonstrationLessonService} from './demonstration-lesson.service';

const student={authUserId:'auth',vistaUserId:'student-1',email:'s@test',status:'active',systemRoleCodes:[],systemPermissions:[],memberships:[]};
describe('DemonstrationLessonService WF-04 persistence',()=>{
  const queryRaw=jest.fn(),executeRaw=jest.fn();
  const prisma={$queryRaw:queryRaw,$executeRaw:executeRaw,benchmark_tasks:{findUnique:jest.fn()},demonstration_episodes:{findFirst:jest.fn(),create:jest.fn()}};
  const learning={assignmentTitleForAttempt:jest.fn().mockResolvedValue('Teach by Demonstration'),assertAttemptWritable:jest.fn().mockResolvedValue(undefined)};
  const service=new DemonstrationLessonService({get:jest.fn()} as never,learning as never,prisma as never);
  beforeEach(()=>{queryRaw.mockReset();executeRaw.mockReset();learning.assignmentTitleForAttempt.mockResolvedValue('Teach by Demonstration');learning.assertAttemptWritable.mockReset();learning.assertAttemptWritable.mockResolvedValue(undefined);});
  it('reloads the persisted Experiment linkage and reflection',async()=>{queryRaw.mockResolvedValueOnce([{id:'demo-1',frame_count:12,metrics:{durationS:1.2},experiment_id:'experiment-1',reflection:'Observations are measured; actions are commands.'}]);await expect(service.session(student as never,'attempt-1')).resolves.toMatchObject({state:'COMPLETED',reflection:'Observations are measured; actions are commands.',artifact:{demonstrationId:'demo-1',experimentId:'experiment-1'}});});
  it('persists reflection against the authoritative Submission and Experiment',async()=>{const session=await service.create(student as never,'attempt-2') as any;session.state='COMPLETED';session.artifact={experimentId:'experiment-2'};queryRaw.mockResolvedValueOnce([{organization_id:'org-1',classroom_id:'class-1',submission_id:'submission-1',challenge_id:null,program_version_id:'version-1'}]);await service.reflect(student as never,session.id,'Observation is measured; action is commanded.');expect(executeRaw).toHaveBeenCalledTimes(1);expect(session.reflection).toBe('Observation is measured; action is commanded.');});
  it('rejects reuse of an artifact that belongs to another evidence context',async()=>{const configured=new DemonstrationLessonService({get:jest.fn().mockReturnValue('http://runtime')} as never,learning as never,prisma as never);const session=await configured.create(student as never,'attempt-3') as any;session.state='RECORDING';const fetchSpy=jest.spyOn(global,'fetch').mockResolvedValue({ok:true,json:async()=>({state:'COMPLETED',artifact:{storageUri:'local://episodes/11111111-1111-4111-8111-111111111111.json',startedAt:'2026-10-25T00:00:00Z',endedAt:'2026-10-25T00:00:01Z',frameCount:2,durationS:1,checksum:'sum'}})} as never);prisma.benchmark_tasks.findUnique.mockResolvedValueOnce({id:'benchmark-1'});queryRaw.mockResolvedValueOnce([{organization_id:'org-1',classroom_id:'class-1',submission_id:'submission-1',challenge_id:null,program_version_id:'version-1'}]);prisma.demonstration_episodes.findFirst.mockResolvedValueOnce({id:'demo-other',recorded_by:'other-user',organization_id:'org-1',provenance:{attemptId:'attempt-3',submissionId:'submission-1'}});await expect(configured.stop(student as never,session.id)).resolves.toMatchObject({state:'FAILED',error:'Recording artifact identity conflicts with existing evidence.'});expect(prisma.demonstration_episodes.create).not.toHaveBeenCalled();fetchSpy.mockRestore();});
  it('requires an active enrollment to create, start, stop or reflect on a demonstration session, but not to read it',async()=>{
    const session=await service.create(student as never,'attempt-9') as any;
    learning.assertAttemptWritable.mockRejectedValue(new Error('revoked'));
    await expect(service.create(student as never,'attempt-9')).rejects.toThrow('revoked');
    await expect(service.start(student as never,session.id)).rejects.toThrow('revoked');
    await expect(service.stop(student as never,session.id)).rejects.toThrow('revoked');
    await expect(service.reflect(student as never,session.id,'text')).rejects.toThrow('revoked');
    queryRaw.mockResolvedValue([]);
    await expect(service.session(student as never,'attempt-9')).resolves.toBeDefined();
  });
});
