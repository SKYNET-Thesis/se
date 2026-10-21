import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AssessmentService } from "./assessment.service";

const instructor = { authUserId:"auth-teacher",vistaUserId:"teacher-1",email:"teacher@vista.test",status:"active",systemRoleCodes:[],systemPermissions:[],memberships:[{id:"m-teacher",organizationId:"org-a",roleCode:"instructor",status:"active",permissions:["learning.work.review","learning.assessment.assess"]}] };
const student = { authUserId:"auth-student",vistaUserId:"student-1",email:"student@vista.test",status:"active",systemRoleCodes:[],systemPermissions:[],memberships:[{id:"m-student",organizationId:"org-a",roleCode:"student",status:"active",permissions:["learning.work.write"]}] };

describe("AssessmentService M2D authorization", () => {
  const queryRaw=jest.fn(); const transaction=jest.fn();
  const assertTeacherClassroomPermission=jest.fn(); const assertStudentClassroomAccess=jest.fn();
  const service=new AssessmentService({$queryRaw:queryRaw,$transaction:transaction} as never,{assertTeacherClassroomPermission,assertStudentClassroomAccess} as never);
  beforeEach(()=>{queryRaw.mockReset();transaction.mockReset();assertTeacherClassroomPermission.mockReset();assertStudentClassroomAccess.mockReset();assertTeacherClassroomPermission.mockResolvedValue(undefined);assertStudentClassroomAccess.mockResolvedValue(undefined);});

  it("allows an instructor to list submissions in an authorized classroom",async()=>{
    queryRaw.mockResolvedValue([{id:"submission-a"}]);
    await expect(service.classroomSubmissions(instructor,"class-a")).resolves.toEqual([{id:"submission-a"}]);
    expect(assertTeacherClassroomPermission).toHaveBeenCalledWith(instructor,"class-a",["learning.work.review"]);
  });
  it("denies an unrelated or cross-organization classroom through scope validation",async()=>{
    assertTeacherClassroomPermission.mockRejectedValue(new NotFoundException());
    await expect(service.classroomSubmissions(instructor,"class-other")).rejects.toBeInstanceOf(NotFoundException);
  });
  it("denies suspended membership and missing review permission at the scope boundary",async()=>{
    assertTeacherClassroomPermission.mockRejectedValue(new NotFoundException());
    await expect(service.classroomSubmissions({...instructor,memberships:[{...instructor.memberships[0],status:"suspended",permissions:[]}]},"class-a")).rejects.toBeInstanceOf(NotFoundException);
  });
  it("rejects assessment scores outside the assignment rubric",async()=>{
    queryRaw.mockResolvedValueOnce([{id:"submission-a",assignment_id:"assignment-a",learner_user_id:"student-1",program_id:"program-a",program_version_id:"version-a",classroom_id:"class-a"}]);
    transaction.mockImplementation(async work=>work({$queryRaw:jest.fn().mockResolvedValue([{id:"criterion-a",max_points:5}]),$executeRaw:jest.fn()}));
    await expect(service.assess(instructor,"submission-a",{scores:[{criterionId:"criterion-a",awardedPoints:6}]})).rejects.toBeInstanceOf(BadRequestException);
  });
  it("does not disclose another student's submission through learner endpoints",async()=>{
    queryRaw.mockResolvedValue([{id:"submission-other",assignment_id:"assignment-a",learner_user_id:"student-other",program_id:"program-a",program_version_id:"version-a",classroom_id:"class-a"}]);
    await expect(service.myFeedback(student,"submission-other")).rejects.toBeInstanceOf(NotFoundException);
    expect(assertStudentClassroomAccess).not.toHaveBeenCalled();
  });
  it("returns a learner submission only after ownership and active classroom scope", async()=>{
    queryRaw.mockResolvedValueOnce([{id:"submission-a",assignment_id:"assignment-a",learner_user_id:"student-1",program_id:"program-a",program_version_id:"version-a",classroom_id:"class-a"}]).mockResolvedValueOnce([{id:"submission-a",reflections:[]}]);
    await expect(service.mySubmission(student,"submission-a")).resolves.toMatchObject({id:"submission-a"});
    expect(assertStudentClassroomAccess).toHaveBeenCalledWith(student,"class-a");
  });
});
