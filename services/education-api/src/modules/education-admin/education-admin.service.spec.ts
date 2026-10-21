import { NotFoundException } from "@nestjs/common";
import { EducationAdminService } from "./education-admin.service";

const baseUser = {
  authUserId: "auth-1", vistaUserId: "user-1", email: "admin@school.test", status: "active",
  systemRoleCodes: [], systemPermissions: [], memberships: [],
};

describe("EducationAdminService organization boundaries", () => {
  const queryRaw = jest.fn();
  const findOffering = jest.fn();
  const createClassroom = jest.fn();
  const scope = { isSystemAdministrator: jest.fn() };
  const service = new EducationAdminService({ $queryRaw: queryRaw, learning_course_offerings: { findFirst: findOffering }, learning_classrooms: { create: createClassroom } } as never, scope as never);

  beforeEach(() => { queryRaw.mockReset(); findOffering.mockReset(); createClassroom.mockReset(); scope.isSystemAdministrator.mockReset().mockReturnValue(false); });

  it("allows a school administrator to read members in the organization carrying the permission", async () => {
    queryRaw.mockResolvedValue([]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.read"] }] };
    await expect(service.members(user, "school-a")).resolves.toEqual([]);
  });

  it("does not reveal members of another school even when the permission exists elsewhere", async () => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.read"] }] };
    await expect(service.members(user, "school-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("allows only the existing system administrator authority across organizations", async () => {
    scope.isSystemAdministrator.mockReturnValue(true);
    queryRaw.mockResolvedValue([]);
    await expect(service.members(baseUser, "school-b")).resolves.toEqual([]);
  });

  it("allows classroom reads only in the school administrator's own organization", async () => {
    queryRaw.mockResolvedValue([]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.read"] }] };
    await expect(service.classrooms(user, "school-a")).resolves.toEqual([]);
    await expect(service.classrooms(user, "school-b")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not allow a school administrator to read another school's classroom roster", async () => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.read"] }] };
    await expect(service.classroomMembers(user, "school-b", "class-b")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates a classroom only in the authorized organization and only from its offering", async () => {
    findOffering.mockResolvedValue({ id: "offering-a" });
    createClassroom.mockResolvedValue({ id: "class-a", organization_id: "school-a" });
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.manage"] }] };
    await expect(service.createClassroom(user, "school-a", { offeringId: "offering-a", name: "Class A", code: "A" })).resolves.toMatchObject({ id: "class-a" });
    expect(findOffering).toHaveBeenCalledWith({ where: { id: "offering-a", organization_id: "school-a" }, select: { id: true } });
    await expect(service.createClassroom(user, "school-b", { offeringId: "offering-a", name: "Class B", code: "B" })).rejects.toBeInstanceOf(NotFoundException);
    expect(createClassroom).toHaveBeenCalledTimes(1);
  });
});
