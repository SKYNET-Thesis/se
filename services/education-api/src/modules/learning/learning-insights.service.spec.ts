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
  it("gradebook: requires teacher review scope, keeps quiz (auto) and rubric (canonical) results separate and never mixes them", async () => {
    const base = { learnerUserId: "l1", fullName: "A", status: "submitted", score: null, passed: null, releasedAt: null, releaseOrigin: null, submittedAt: null };
    queryRaw
      .mockResolvedValueOnce([
        { ...base, attemptId: "q1", assignmentId: "a1", title: "Quiz", kind: "knowledge_check", status: "evaluated", score: 80, passed: true, releasedAt: new Date(), releaseOrigin: "system_auto" },
        { ...base, attemptId: "r1", assignmentId: "a2", title: "Blockly", kind: null },
        { ...base, attemptId: "r2", assignmentId: "a3", title: "Final", kind: null },
        { ...base, attemptId: "n1", assignmentId: "a4", title: "Plain", kind: null },
      ])
      .mockResolvedValueOnce([
        { attemptId: "r1", maxPoints: 12, awardedPoints: 12 }, { attemptId: "r1", maxPoints: 8, awardedPoints: null },   // partial: one criterion ungraded
        { attemptId: "r2", maxPoints: 6, awardedPoints: 6 }, { attemptId: "r2", maxPoints: 4, awardedPoints: 0 },        // complete with an explicit zero
      ]);
    const rows = await service.gradebook(teacher, "classroom-1") as Array<Record<string, any>>;
    expect(scope.assertTeacherClassroomPermission).toHaveBeenCalledWith(teacher, "classroom-1", ["learning.work.review"]);
    const by = Object.fromEntries(rows.map((r) => [r.attemptId, r]));
    expect(by.q1).toMatchObject({ resultKind: "quiz", percentage: 80, passed: true, rubric: null, released: true });
    expect(by.r1).toMatchObject({ resultKind: "rubric", graded: "partial", released: false, percentage: 60 });          // 12 of 20: the ungraded criterion counts in the maximum
    expect(by.r1.rubric).toMatchObject({ awarded: 12, max: 20, complete: false });
    expect(by.r2).toMatchObject({ resultKind: "rubric", graded: "complete", percentage: 60 });                           // 6 of 10, explicit zero counted as graded
    expect(by.n1).toMatchObject({ resultKind: "other", percentage: null, rubric: null });                                // no rubric criteria: nothing invented
  });
});
