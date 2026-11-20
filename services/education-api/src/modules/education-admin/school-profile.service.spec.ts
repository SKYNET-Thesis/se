import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { SchoolProfileService } from "./school-profile.service";

const member = (permissions: string[], org = "org-1") => ({ authUserId: "a", vistaUserId: "u-sa", email: "s@x.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [{ id: "m", organizationId: org, roleCode: "school_admin", status: "active", permissions }] });

describe("SchoolProfileService", () => {
  const queryRaw = jest.fn(); const executeRaw = jest.fn();
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const prisma = { $queryRaw: queryRaw, $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const resendInvite = jest.fn();
  const service = new SchoolProfileService({ ...prisma, $executeRaw: executeRaw } as never, { isSystemAdministrator: () => false } as never, { resendInvite } as never);
  beforeEach(() => { resendInvite.mockReset().mockResolvedValue(undefined); queryRaw.mockReset(); executeRaw.mockReset().mockResolvedValue(1); });

  it("does not reveal another school's profile, roles or allow edits", async () => {
    const user = member(["education.members.read", "education.members.provision"]);
    await expect(service.profile(user, "org-2")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.roles(user, "org-2")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateProfile(user, "org-2", "Hijack")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setMemberStatus(user, "org-2", "u-x", "suspended")).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("requires the provision permission for edits and status changes", async () => {
    const readOnly = member(["education.members.read"]);
    await expect(service.updateProfile(readOnly, "org-1", "New")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setMemberStatus(readOnly, "org-1", "u-x", "suspended")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses duplicate school names", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "other" }]);
    await expect(service.updateProfile(member(["education.members.provision"]), "org-1", "Taken")).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not let an administrator change their own access or another administrator's", async () => {
    const user = member(["education.members.provision"]);
    await expect(service.setMemberStatus(user, "org-1", "u-sa", "suspended")).rejects.toBeInstanceOf(ForbiddenException);
    queryRaw.mockResolvedValueOnce([{ id: "m-2", role: "school_admin", status: "active" }]);
    await expect(service.setMemberStatus(user, "org-1", "u-other-admin", "suspended")).rejects.toBeInstanceOf(ForbiddenException);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("suspends a student and records an audit entry", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "m-3", role: "student", status: "active" }]);
    await expect(service.setMemberStatus(member(["education.members.provision"]), "org-1", "u-stu", "suspended")).resolves.toEqual({ userId: "u-stu", status: "suspended" });
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });

  describe("invitation reissue", () => {
    const admin = member(["education.members.provision"]);
    it("requires the provision permission and the caller's own school", async () => {
      await expect(service.reissueInstructorInvitation(member(["education.members.read"]), "org-1", "u-t")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.reissueInstructorInvitation(admin, "org-2", "u-t")).rejects.toBeInstanceOf(NotFoundException);
      expect(resendInvite).not.toHaveBeenCalled();
    });
    it("only re-invites instructors who have not accepted yet", async () => {
      queryRaw.mockResolvedValueOnce([{ email: "a@x.test", full_name: "A", status: "invited", role: "student", membership_status: "active" }]);
      await expect(service.reissueInstructorInvitation(admin, "org-1", "u-s")).rejects.toBeInstanceOf(NotFoundException);
      queryRaw.mockResolvedValueOnce([{ email: "a@x.test", full_name: "A", status: "active", role: "instructor", membership_status: "active" }]);
      await expect(service.reissueInstructorInvitation(admin, "org-1", "u-t")).rejects.toBeInstanceOf(ConflictException);
      expect(resendInvite).not.toHaveBeenCalled();
    });
    it("sends the invitation again and audits it", async () => {
      queryRaw.mockResolvedValueOnce([{ email: "t@x.test", full_name: "T", status: "invited", role: "instructor", membership_status: "active" }]);
      await expect(service.reissueInstructorInvitation(admin, "org-1", "u-t")).resolves.toMatchObject({ email: "t@x.test", status: "invitation_sent" });
      expect(resendInvite).toHaveBeenCalledWith("t@x.test", "T");
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });
  });
});
