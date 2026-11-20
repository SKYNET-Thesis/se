import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { EducationAdminService } from "./education-admin.service";

const baseUser = {
  authUserId: "auth-1",
  vistaUserId: "user-1",
  email: "admin@vista.test",
  status: "active",
  systemRoleCodes: ["system_admin"],
  systemPermissions: ["org.manage"],
  memberships: [],
};

const nonAdminUser = {
  authUserId: "auth-2",
  vistaUserId: "user-2",
  email: "teacher@school.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: [],
  memberships: [],
};

describe("EducationAdminService - Organization Management", () => {
  const prismaMock = {
    organizations: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
    },
    roles: {
      findFirst: jest.fn(),
    },
    memberships: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const scopeMock = {
    isSystemAdministrator: jest.fn(),
  };

  let service: EducationAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EducationAdminService(
      prismaMock as never,
      scopeMock as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  describe("createOrganization", () => {
    it("creates an organization when called by system admin", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      const createdOrg = {
        id: "org-1",
        name: "Test School",
        type: "school",
        segment: "k12",
        school_code: "SCH-001",
        status: "active",
      };
      prismaMock.organizations.create.mockResolvedValue(createdOrg);

      const result = await service.createOrganization(baseUser, {
        name: "  Test School  ",
        type: "school",
        segment: "k12",
        schoolCode: "  SCH-001  ",
      });

      expect(prismaMock.organizations.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: "Test School",
          type: "school",
          segment: "k12",
          school_code: "SCH-001",
        }),
      });
      expect(result).toEqual(createdOrg);
    });

    it("rejects non-system-admin with NotFoundException", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(false);

      await expect(
        service.createOrganization(nonAdminUser, {
          name: "Test School",
          type: "school",
          segment: "k12",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prismaMock.organizations.create).not.toHaveBeenCalled();
    });

    it("throws ConflictException on duplicate school code", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.create.mockRejectedValue({ code: "P2002" });

      await expect(
        service.createOrganization(baseUser, {
          name: "Test School",
          type: "school",
          segment: "k12",
          schoolCode: "EXISTING",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("updateOrganization", () => {
    it("updates organization fields when called by system admin", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue({ id: "org-1" });
      prismaMock.organizations.update.mockResolvedValue({ id: "org-1", name: "Updated Name" });

      const result = await service.updateOrganization(baseUser, "org-1", {
        name: "  Updated Name  ",
        status: "suspended",
      });

      expect(prismaMock.organizations.update).toHaveBeenCalledWith({
        where: { id: "org-1" },
        data: expect.objectContaining({
          name: "Updated Name",
          status: "suspended",
        }),
      });
      expect(result).toEqual({ id: "org-1", name: "Updated Name" });
    });

    it("throws NotFoundException if organization does not exist", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOrganization(baseUser, "org-nonexistent", { name: "New Name" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ConflictException if updated school code already exists", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue({ id: "org-1" });
      prismaMock.organizations.update.mockRejectedValue({ code: "P2002" });

      await expect(
        service.updateOrganization(baseUser, "org-1", { schoolCode: "DUPLICATE" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("getOrganization", () => {
    it("returns organization with school admin list", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue({
        id: "org-1",
        name: "Test School",
        _count: { memberships: 5 },
      });
      prismaMock.$queryRaw.mockResolvedValue([
        { id: "m-1", userId: "u-1", fullName: "Admin User", email: "admin@test.com", membershipStatus: "active" },
      ]);

      const result = await service.getOrganization(baseUser, "org-1");

      expect(result.id).toBe("org-1");
      expect(result.schoolAdmins).toHaveLength(1);
      expect(result.schoolAdmins[0].fullName).toBe("Admin User");
    });

    it("throws NotFoundException if organization not found", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue(null);

      await expect(service.getOrganization(baseUser, "org-missing")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("assignSchoolAdmin", () => {
    it("assigns school admin to organization via membership upsert", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue({ id: "org-1" });
      prismaMock.users.findUnique.mockResolvedValue({ id: "user-target", full_name: "Target User", status: "active" });
      prismaMock.roles.findFirst.mockResolvedValue({ id: "role-school-admin", code: "school_admin" });
      prismaMock.memberships.upsert.mockResolvedValue({ id: "m-new", status: "active" });

      const result = await service.assignSchoolAdmin(baseUser, "org-1", { userId: "user-target" });

      expect(prismaMock.memberships.upsert).toHaveBeenCalledWith({
        where: { user_id_organization_id: { user_id: "user-target", organization_id: "org-1" } },
        update: { role_id: "role-school-admin", status: "active", updated_at: expect.any(Date) },
        create: { user_id: "user-target", organization_id: "org-1", role_id: "role-school-admin", status: "active" },
      });
      expect(result).toHaveProperty("user");
    });

    it("throws NotFoundException if target user is not found or not active", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.organizations.findUnique.mockResolvedValue({ id: "org-1" });
      prismaMock.users.findUnique.mockResolvedValue(null);

      await expect(
        service.assignSchoolAdmin(baseUser, "org-1", { userId: "user-missing" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("removeSchoolAdmin", () => {
    it("soft-deactivates school admin membership", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.memberships.findFirst.mockResolvedValue({ id: "m-existing" });
      prismaMock.memberships.update.mockResolvedValue({ id: "m-existing", status: "inactive" });

      const result = await service.removeSchoolAdmin(baseUser, "org-1", "user-to-remove");

      expect(prismaMock.memberships.update).toHaveBeenCalledWith({
        where: { id: "m-existing" },
        data: expect.objectContaining({ status: "inactive" }),
      });
      expect(result.status).toBe("inactive");
    });

    it("throws NotFoundException if school admin membership not found", async () => {
      scopeMock.isSystemAdministrator.mockReturnValue(true);
      prismaMock.memberships.findFirst.mockResolvedValue(null);

      await expect(
        service.removeSchoolAdmin(baseUser, "org-1", "user-missing"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
