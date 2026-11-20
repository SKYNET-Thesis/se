import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { OrganizationManagementService } from "./organization-management.service";

const sysAdmin = { authUserId: "a", vistaUserId: "u-sys", email: "s@x.test", status: "active", systemRoleCodes: ["system_admin"], systemPermissions: ["org.manage"], memberships: [] };
const schoolAdmin = { ...sysAdmin, vistaUserId: "u-sa", systemRoleCodes: [], systemPermissions: [], memberships: [{ id: "m", organizationId: "org-1", roleCode: "school_admin", status: "active", permissions: ["education.members.provision"] }] };

describe("OrganizationManagementService", () => {
  const queryRaw = jest.fn(); const executeRaw = jest.fn(); const invite = jest.fn();
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const prisma = { $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const scope = { isSystemAdministrator: (u: typeof sysAdmin) => u.systemPermissions.includes("org.manage") };
  const resendInvite = jest.fn();
  const service = new OrganizationManagementService(prisma as never, scope as never, { invite, resendInvite } as never);
  beforeEach(() => { resendInvite.mockReset().mockResolvedValue(undefined); queryRaw.mockReset(); executeRaw.mockReset().mockResolvedValue(1); invite.mockReset(); });

  it.each(["list", "create", "update", "assignAdministrator", "revokeAdministrator", "administrators", "detail"] as const)("%s is invisible (404) to non-system roles and never touches the database", async (method) => {
    const call = () => (service as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method](schoolAdmin, "org-1", { name: "x", email: "a@b.co", fullName: "Ab" }, "user-x");
    await expect(call()).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled(); expect(executeRaw).not.toHaveBeenCalled();
  });

  it("refuses a duplicate organization name case-insensitively", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "dup" }]);
    await expect(service.create(sysAdmin, { name: "  Alpha School " })).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses an inverted contract period", async () => {
    await expect(service.create(sysAdmin, { name: "Beta", contractStart: "2027-02-01", contractEnd: "2027-01-01" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not reopen a closed organization", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "org-1", name: "A", status: "closed", contract_start: null, contract_end: null }]);
    await expect(service.update(sysAdmin, "org-1", { status: "active" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not assign a person who already belongs to another organization", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "org-1", status: "active" }]).mockResolvedValueOnce([{ id: "user-9" }]).mockResolvedValueOnce([{ organization_id: "org-2" }]);
    await expect(service.assignAdministrator(sysAdmin, "org-1", { email: "Head@School.test", fullName: "Head Teacher" })).rejects.toBeInstanceOf(ConflictException);
    expect(invite).not.toHaveBeenCalled(); expect(executeRaw).not.toHaveBeenCalled();
  });

  it("refuses to assign administrators to a closed organization", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "org-1", status: "closed" }]);
    await expect(service.assignAdministrator(sysAdmin, "org-1", { email: "h@s.test", fullName: "Head" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("protects the last active administrator", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "m-1", status: "active" }]).mockResolvedValueOnce([{ n: 0 }]);
    await expect(service.revokeAdministrator(sysAdmin, "org-1", "user-1")).rejects.toBeInstanceOf(ConflictException);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  describe("administrator invitation and account status", () => {
    it("is invisible to non-system roles", async () => {
      await expect(service.reissueAdministratorInvitation(schoolAdmin, "org-1", "u")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.setAccountStatus(schoolAdmin, "u", "disabled")).rejects.toBeInstanceOf(NotFoundException);
      expect(queryRaw).not.toHaveBeenCalled();
    });
    it("re-invites only an administrator who has not accepted", async () => {
      queryRaw.mockResolvedValueOnce([{ email: "h@x.test", full_name: "H", status: "active" }]);
      await expect(service.reissueAdministratorInvitation(sysAdmin, "org-1", "u")).rejects.toBeInstanceOf(ConflictException);
      queryRaw.mockResolvedValueOnce([{ email: "h@x.test", full_name: "H", status: "invited" }]);
      await expect(service.reissueAdministratorInvitation(sysAdmin, "org-1", "u")).resolves.toMatchObject({ status: "invitation_sent" });
      expect(resendInvite).toHaveBeenCalledTimes(1);
    });
    it("never lets an operator disable themselves or a platform administrator", async () => {
      await expect(service.setAccountStatus(sysAdmin, "u-sys", "disabled")).rejects.toThrow(/own account/);
      queryRaw.mockResolvedValueOnce([{ id: "u2", status: "active", auth_user_id: "a", email_verified_at: new Date(), system_roles: 1 }]);
      await expect(service.setAccountStatus(sysAdmin, "u2", "disabled")).rejects.toThrow(/Platform administrators/);
      expect(executeRaw).not.toHaveBeenCalled();
    });
    it("disables, and re-enables to the state the account really had", async () => {
      queryRaw.mockResolvedValueOnce([{ id: "u3", status: "active", auth_user_id: "a", email_verified_at: new Date(), system_roles: 0 }]);
      await expect(service.setAccountStatus(sysAdmin, "u3", "disabled")).resolves.toEqual({ userId: "u3", status: "disabled" });
      queryRaw.mockResolvedValueOnce([{ id: "u3", status: "disabled", auth_user_id: "a", email_verified_at: new Date(), system_roles: 0 }]);
      await expect(service.setAccountStatus(sysAdmin, "u3", "active")).resolves.toEqual({ userId: "u3", status: "active" });
      queryRaw.mockResolvedValueOnce([{ id: "u4", status: "disabled", auth_user_id: "b", email_verified_at: null, system_roles: 0, student_memberships: 0 }]);
      await expect(service.setAccountStatus(sysAdmin, "u4", "active")).resolves.toEqual({ userId: "u4", status: "invited" });
      // a school-provisioned student has no verified e-mail but is a normal active account: it must come back active, not invited
      queryRaw.mockResolvedValueOnce([{ id: "u5", status: "disabled", auth_user_id: "c", email_verified_at: null, system_roles: 0, student_memberships: 1 }]);
      await expect(service.setAccountStatus(sysAdmin, "u5", "active")).resolves.toEqual({ userId: "u5", status: "active" });
    });
  });
});
