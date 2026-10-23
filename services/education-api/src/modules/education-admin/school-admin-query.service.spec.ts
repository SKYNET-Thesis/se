import { NotFoundException } from "@nestjs/common";
import { SchoolAdminQueryService } from "./school-admin-query.service";

const actor = {
  authUserId: "auth-1",
  vistaUserId: "user-1",
  email: "admin@school.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: [],
  memberships: [{
    id: "membership-1",
    organizationId: "school-a",
    roleCode: "school_admin",
    status: "active",
    permissions: ["education.members.read", "education.classroom.read", "education.classroom.members.manage"],
  }],
};

describe("SchoolAdminQueryService", () => {
  const queryRaw = jest.fn();
  const findClassroom = jest.fn();
  const scope = { isSystemAdministrator: jest.fn().mockReturnValue(false) };
  const service = new SchoolAdminQueryService({
    $queryRaw: queryRaw,
    learning_classrooms: { findFirst: findClassroom },
  } as never, scope as never);

  beforeEach(() => {
    queryRaw.mockReset();
    findClassroom.mockReset().mockResolvedValue({ id: "class-a" });
    scope.isSystemAdministrator.mockReset().mockReturnValue(false);
  });

  it("returns the lightweight organization overview aggregate", async () => {
    queryRaw.mockResolvedValue([{
      studentsCount: 20,
      teachersCount: 5,
      classroomsCount: 2,
      robotResourcesCount: 1,
      accountSetupPendingCount: 18,
    }]);

    await expect(service.overview(actor, "school-a")).resolves.toEqual({
      studentsCount: 20,
      teachersCount: 5,
      classroomsCount: 2,
      robotResourcesCount: 1,
      accountSetupPendingCount: 18,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns a bounded People page with total metadata", async () => {
    queryRaw.mockResolvedValue([{ total: 21, items: [{ id: "student-1", displayName: "Bao Ngoc", role: "student", studentCode: "S001", gradeLevel: "Grade 3", email: null, accountState: "account_setup_pending" }] }]);

    await expect(service.people(actor, "school-a", { page: 2, pageSize: 20 })).resolves.toEqual({
      items: [{ id: "student-1", displayName: "Bao Ngoc", role: "student", studentCode: "S001", gradeLevel: "Grade 3", email: null, accountState: "account_setup_pending" }],
      page: 2,
      pageSize: 20,
      total: 21,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("passes People search and role filters into the parameterized query", async () => {
    queryRaw.mockResolvedValue([{ total: 1, items: [] }]);
    await service.people(actor, "school-a", { page: 1, pageSize: 20, search: "bao", role: "student" });
    expect(queryRaw.mock.calls[0]).toEqual(expect.arrayContaining(["bao", "student"]));
  });

  it("returns searchable selectable member candidates", async () => {
    queryRaw.mockResolvedValue([{ total: 1, items: [{ userId: "student-1", displayName: "Bao Ngoc", organizationRole: "student", schoolCode: "S001", accountState: "account_setup_pending", alreadyMember: false }] }]);
    await expect(service.memberCandidates(actor, "school-a", "class-a", { page: 1, pageSize: 20, search: "S001" })).resolves.toMatchObject({
      total: 1,
      items: [expect.objectContaining({ userId: "student-1", alreadyMember: false })],
    });
    expect(findClassroom).toHaveBeenCalledWith({ where: { id: "class-a", organization_id: "school-a" }, select: { id: true } });
    expect(queryRaw.mock.calls[0]).toEqual(expect.arrayContaining(["S001"]));
  });

  it("filters existing classroom members before candidate count and pagination", async () => {
    queryRaw.mockResolvedValue([{ total: 1, items: [{ userId: "teacher-1", alreadyMember: false }] }]);
    await service.memberCandidates(actor, "school-a", "class-a", { page: 1, pageSize: 20, search: "teacher" });
    const sql = queryRaw.mock.calls[0].flat().join(" ");
    expect(sql).toContain("NOT EXISTS");
    expect(sql.indexOf("NOT EXISTS")).toBeLessThan(sql.indexOf("LIMIT"));
  });

  it("denies cross-organization reads before querying", async () => {
    await expect(service.overview(actor, "school-b")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.people(actor, "school-b", { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
