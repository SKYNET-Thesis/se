import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ExperimentService } from "./experiment.service";
import { SchematicEngineService } from "./schematic-engine.service";
const user={authUserId:"a",vistaUserId:"student-1",email:"s@test",status:"active",systemRoleCodes:[],systemPermissions:[],memberships:[{id:"m",organizationId:"org-a",roleCode:"student",status:"active",permissions:["learning.work.write","learning.experiment.execute"]}]};
describe("ExperimentService M3",()=>{const queryRaw=jest.fn(),transaction=jest.fn(),assertStudentClassroomAccess=jest.fn();const service=new ExperimentService({$queryRaw:queryRaw,$transaction:transaction} as never,{assertStudentClassroomAccess} as never,new SchematicEngineService());beforeEach(()=>{queryRaw.mockReset();transaction.mockReset();assertStudentClassroomAccess.mockReset();assertStudentClassroomAccess.mockResolvedValue(undefined);});
it("reuses evidence only for the same attempt and program version",async()=>{queryRaw.mockResolvedValueOnce([{attempt_id:"a1",classroom_id:"c1",assignment_id:"as1",program_id:"p1",submission_id:"s1",challenge_id:null}]);const txQuery=jest.fn().mockResolvedValueOnce([{id:"existing",learner_user_id:"student-1",status:"succeeded",execution_mode:"schematic"}]);transaction.mockImplementation(async work=>work({$queryRaw:txQuery,$executeRaw:jest.fn()}));await expect(service.create(user,"a1",{programVersionId:"v1",executionMode:"schematic"})).resolves.toMatchObject({id:"existing"});expect(txQuery).toHaveBeenCalledTimes(1);});
it("creates only an own authorized version as a pending schematic experiment",async()=>{queryRaw.mockResolvedValueOnce([{attempt_id:"a1",classroom_id:"c1",assignment_id:"as1",program_id:"p1",submission_id:"s1",challenge_id:null}]);transaction.mockImplementation(async work=>work({$queryRaw:jest.fn().mockResolvedValue([{id:"e1",learner_user_id:"student-1",status:"pending",execution_mode:"schematic"}]),$executeRaw:jest.fn()}));const r=await service.create(user,"a1",{programVersionId:"v1",executionMode:"schematic"});expect(r.status).toBe("pending");expect(assertStudentClassroomAccess).toHaveBeenCalledWith(user,"c1",{requireActiveEnrollment:true});});
it("denies another student's version or unrelated classroom without disclosure",async()=>{queryRaw.mockResolvedValue([]);await expect(service.create(user,"other",{programVersionId:"v-other",executionMode:"schematic"})).rejects.toBeInstanceOf(NotFoundException);});
it("rejects unsupported simulation, offline replay, and real-robot modes",async()=>{await expect(service.create(user,"a1",{programVersionId:"v1",executionMode:"simulation" as never})).rejects.toBeInstanceOf(BadRequestException);});
it("denies suspended membership or missing experiment capability",async()=>{await expect(service.mine({...user,memberships:[{...user.memberships[0],status:"suspended",permissions:[]}]})).rejects.toBeInstanceOf(NotFoundException);});
it("denies invalid lifecycle transitions",async()=>{queryRaw.mockResolvedValue([{id:"e1",learner_user_id:"student-1",status:"cancelled",execution_mode:"schematic"}]);await expect(service.cancel(user,"e1")).rejects.toBeInstanceOf(ConflictException);});
it("does not disclose artifacts outside experiment ownership",async()=>{queryRaw.mockResolvedValue([]);await expect(service.artifacts(user,"other-e")).rejects.toBeInstanceOf(NotFoundException);});
it("persists the small schematic result in output_snapshot without creating an external artifact row",async()=>{queryRaw.mockResolvedValueOnce([{id:"e1",learner_user_id:"student-1",status:"pending",execution_mode:"schematic",classroom_id:"c1"}]).mockResolvedValueOnce([{input_snapshot:{programVersionId:"v1"},program_version_id:"v1"}]).mockResolvedValueOnce([{robot_program:{kind:"robot_program",schemaVersion:1,steps:[{type:"wait",durationMs:100}]}}]);const txQuery=jest.fn().mockResolvedValue([{id:"e1"}]);const txExecute=jest.fn().mockResolvedValue(undefined);transaction.mockImplementation(async work=>work({$queryRaw:txQuery,$executeRaw:txExecute}));const result=await service.runSchematic(user,"e1");expect(result.timeline).toHaveLength(1);expect(txExecute).toHaveBeenCalledTimes(3);expect(txQuery).toHaveBeenCalledTimes(1);});
it("does not claim a run when another request already changed pending lifecycle",async()=>{queryRaw.mockResolvedValueOnce([{id:"e1",learner_user_id:"student-1",status:"pending",execution_mode:"schematic",classroom_id:"c1"}]).mockResolvedValueOnce([{input_snapshot:{programVersionId:"v1"},program_version_id:"v1"}]).mockResolvedValueOnce([{robot_program:{kind:"robot_program",schemaVersion:1,steps:[]}}]);transaction.mockImplementation(async work=>work({$queryRaw:jest.fn().mockResolvedValue([]),$executeRaw:jest.fn()}));await expect(service.runSchematic(user,"e1")).rejects.toBeInstanceOf(ConflictException);});
it("rejects malformed canonical input before it claims the pending experiment",async()=>{queryRaw.mockResolvedValueOnce([{id:"e1",learner_user_id:"student-1",status:"pending",execution_mode:"schematic",classroom_id:"c1"}]).mockResolvedValueOnce([{input_snapshot:{programVersionId:"v1"},program_version_id:"v1"}]).mockResolvedValueOnce([{robot_program:{kind:"robot_program",schemaVersion:1,steps:[{type:"move.cartesian"}]}}]);await expect(service.runSchematic(user,"e1")).rejects.toBeInstanceOf(BadRequestException);expect(transaction).not.toHaveBeenCalled();});
it("cannot publish terminal success when the transactional output write fails",async()=>{queryRaw.mockResolvedValueOnce([{id:"e1",learner_user_id:"student-1",status:"pending",execution_mode:"schematic",classroom_id:"c1"}]).mockResolvedValueOnce([{input_snapshot:{programVersionId:"v1"},program_version_id:"v1"}]).mockResolvedValueOnce([{robot_program:{kind:"robot_program",schemaVersion:1,steps:[]}}]);const txExecute=jest.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("write failed"));transaction.mockImplementation(async work=>work({$queryRaw:jest.fn().mockResolvedValue([{id:"e1"}]),$executeRaw:txExecute}));await expect(service.runSchematic(user,"e1")).rejects.toThrow("write failed");expect(txExecute).toHaveBeenCalledTimes(2);});
describe("ExperimentService.runSchematic enrollment enforcement",()=>{
 const queryRaw=jest.fn(),transaction=jest.fn(),assertStudentClassroomAccess=jest.fn();
 const service=new ExperimentService({$queryRaw:queryRaw,$transaction:transaction} as never,{assertStudentClassroomAccess} as never,new SchematicEngineService());
 const row={id:"e1",learner_user_id:"student-1",status:"pending",execution_mode:"schematic",classroom_id:"c1"};
 beforeEach(()=>{queryRaw.mockReset();transaction.mockReset();assertStudentClassroomAccess.mockReset();});
 it("checks the experiment's own classroom with the enrollment-aware guard before any run work",async()=>{
  assertStudentClassroomAccess.mockRejectedValue(new NotFoundException("Assignment was not found."));
  queryRaw.mockResolvedValueOnce([row]);
  await expect(service.runSchematic(user,"e1")).rejects.toBeInstanceOf(NotFoundException);
  expect(assertStudentClassroomAccess).toHaveBeenCalledWith(user,"c1",{requireActiveEnrollment:true});
  expect(queryRaw).toHaveBeenCalledTimes(1);expect(transaction).not.toHaveBeenCalled();
 });
 it("scopes the lookup to the caller and resolves the classroom from attempt provenance",async()=>{
  queryRaw.mockResolvedValueOnce([]);
  await expect(service.runSchematic(user,"someone-elses")).rejects.toBeInstanceOf(NotFoundException);
  const sql=(queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
  expect(sql).toContain("e.learner_user_id=");expect(sql).toContain("a.learner_user_id=e.learner_user_id");expect(sql).toContain("ca.classroom_id");
  expect(queryRaw.mock.calls[0].slice(1)).toContain("student-1");
  expect(assertStudentClassroomAccess).not.toHaveBeenCalled();
 });
 it("denies a caller without the execute capability",async()=>{
  await expect(service.runSchematic({...user,memberships:[]} as never,"e1")).rejects.toBeInstanceOf(NotFoundException);
  expect(queryRaw).not.toHaveBeenCalled();
 });
});
describe("ExperimentService.compare ownership",()=>{
 const queryRaw=jest.fn(),assertStudentClassroomAccess=jest.fn();
 const service=new ExperimentService({$queryRaw:queryRaw} as never,{assertStudentClassroomAccess} as never,new SchematicEngineService());
 const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"];
 beforeEach(()=>{queryRaw.mockReset();assertStudentClassroomAccess.mockReset();});
 it("only compares experiments the caller owns, and a foreign or unknown id is indistinguishable from a missing one",async()=>{
  queryRaw.mockResolvedValueOnce([{id:ids[0],learner_user_id:"student-1",status:"succeeded",execution_mode:"schematic"}]);
  await expect(service.compare(user,{title:"t",experimentIds:ids})).rejects.toBeInstanceOf(NotFoundException);
  expect(queryRaw).toHaveBeenCalledTimes(1); // no INSERT happened
  const sql=(queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
  expect(sql).toContain("learner_user_id=");expect(queryRaw.mock.calls[0].slice(1)).toContain("student-1");
 });
 it("rejects duplicate ids and callers without the execute capability before touching the database",async()=>{
  await expect(service.compare(user,{title:"t",experimentIds:[ids[0],ids[0]]})).rejects.toBeInstanceOf(BadRequestException);
  await expect(service.compare({...user,memberships:[]} as never,{title:"t",experimentIds:ids})).rejects.toBeInstanceOf(NotFoundException);
  expect(queryRaw).not.toHaveBeenCalled();
 });
 it("stores only the caller's identity and returns no classroom, organization or other learner data; historical comparison stays possible after revocation",async()=>{
  queryRaw.mockResolvedValueOnce(ids.map(id=>({id,learner_user_id:"student-1",status:"succeeded",execution_mode:"schematic"})))
   .mockResolvedValueOnce([{id:"c1",learner_user_id:"student-1",title:"t",experiment_ids:ids,comparison_metrics:{},conclusion:null,created_at:new Date()}]);
  const result=await service.compare(user,{title:"t",experimentIds:ids}) as Record<string,unknown>;
  expect(Object.keys(result).sort()).toEqual(["comparison_metrics","conclusion","created_at","experiment_ids","id","learner_user_id","title"]);
  expect(queryRaw.mock.calls[1].slice(1)).toContain("student-1");
  expect(assertStudentClassroomAccess).not.toHaveBeenCalled(); // pure own-history note: no enrollment dependency
 });
});
});
