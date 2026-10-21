import { NotFoundException } from "@nestjs/common";
import { LearningInsightsService } from "./learning-insights.service";

const student = { authUserId:"auth-1",vistaUserId:"student-1",email:"student@test",status:"active",systemRoleCodes:[],systemPermissions:[],memberships:[{id:"m-1",organizationId:"org-1",roleCode:"student",status:"active",permissions:["learning.work.write"]}] };
const teacher = { ...student, vistaUserId:"teacher-1", memberships:[{id:"m-2",organizationId:"org-1",roleCode:"instructor",status:"active",permissions:["learning.work.review","learning.delivery.manage"]}] };

describe("LearningInsightsService scoped read models", () => {
  const queryRaw = jest.fn();
  const scope = { isSystemAdministrator: jest.fn(), assertTeacherClassroomPermission: jest.fn(), assertStudentClassroomAccess: jest.fn(), assertClassroomAccess: jest.fn(), canManageClassroom: jest.fn() };
  const service = new LearningInsightsService({ $queryRaw: queryRaw } as never, scope as never);
  beforeEach(() => { queryRaw.mockReset(); Object.values(scope).forEach((fn) => fn.mockReset()); scope.isSystemAdministrator.mockReturnValue(false); scope.assertTeacherClassroomPermission.mockResolvedValue(undefined); });
  it("does not disclose an organization outside an active membership", async () => {
    await expect(service.organization(student, "org-other")).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it("requires teacher/TA review scope before classroom member enumeration", async () => {
    queryRaw.mockResolvedValue([{ id:"member-1" }]);
    await expect(service.classroomMembers(teacher, "classroom-1")).resolves.toEqual([{ id:"member-1" }]);
    expect(scope.assertTeacherClassroomPermission).toHaveBeenCalledWith(teacher, "classroom-1", ["learning.work.review"]);
  });
  it("reads learner dashboard only from the current JWT-resolved user", async () => {
    queryRaw.mockResolvedValue([{ classroom_count: 1, attempt_count: 2 }]);
    await expect(service.myDashboard(student)).resolves.toMatchObject({ classroom_count: 1, attempt_count: 2 });
  });
});
