import { ConflictException, NotFoundException, BadRequestException } from "@nestjs/common";
import { StaffAccountService } from "./staff-account.service";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const sysAdmin = { vistaUserId: "u-sys", authUserId: "a-sys", systemPermissions: ["org.manage"], memberships: [] } as never;
const schoolAdmin = (org = ORG) => ({ vistaUserId: "u-sa", authUserId: "a-sa", systemPermissions: [], memberships: [{ organizationId: org, status: "active", roleCode: "school_admin", permissions: ["education.members.provision"] }] }) as never;
const instructor = { vistaUserId: "u-in", authUserId: "a-in", systemPermissions: [], memberships: [{ organizationId: ORG, status: "active", roleCode: "instructor", permissions: [] }] } as never;
const scope = { isSystemAdministrator: (u: { systemPermissions: string[] }) => u.systemPermissions.includes("org.manage") } as never;

function harness(options: { duplicateEmail?: boolean; failInsert?: boolean; orgStatus?: string; target?: Record<string, unknown>; lastSignInAt?: string | null; created?: boolean } = {}) {
  const logs: unknown[] = [];
  const writes: string[] = [];
  const tx = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => { const sql = strings.join("?"); if (sql.includes("INSERT INTO public.users")) { if (options.failInsert) throw new Error("db down"); return [{ id: "new-user" }]; } return []; }),
    $executeRaw: jest.fn(async (strings: TemplateStringsArray) => { writes.push(strings.join("?")); return 1; }),
  };
  const prisma = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
      const sql = strings.join("?");
      if (sql.includes("FROM public.organizations")) return [{ status: options.orgStatus ?? "active" }];
      if (sql.includes("lower(email)")) return options.duplicateEmail ? [{ id: "x" }] : [];
      if (sql.includes("lower(employee_code)")) return [];
      if (sql.includes("JOIN public.memberships m")) return options.target ? [options.target] : [];
      return [];
    }),
    $transaction: jest.fn(async (work: (t: unknown) => unknown) => work(tx)),
  };
  const supabase = {
    createStaffIdentity: jest.fn(async () => ({ user: { id: "auth-new" }, created: options.created ?? true })),
    invite: jest.fn(async () => ({ id: "auth-invited" })),
    deleteStudentIdentity: jest.fn(async () => undefined),
    setStudentPassword: jest.fn(async () => undefined),
    getAuthUser: jest.fn(async () => ({ id: "auth-t", lastSignInAt: options.lastSignInAt ?? null })),
  };
  const service = new StaffAccountService(prisma as never, scope, supabase as never);
  (service as unknown as { logger: unknown }).logger = { error: (m: unknown) => logs.push(m), warn: (m: unknown) => logs.push(m), log: (m: unknown) => logs.push(m) };
  return { service, prisma, supabase, tx, logs, writes };
}
const direct = { method: "direct" as const, role: "instructor" as const, fullName: "Ada Teacher", email: "Ada@School.Test", employeeCode: "E-1" };

describe("StaffAccountService", () => {
  const previous = process.env.STAFF_TEMP_PASSWORD_ENABLED;
  beforeEach(() => { process.env.STAFF_TEMP_PASSWORD_ENABLED = "true"; });
  afterAll(() => { if (previous === undefined) delete process.env.STAFF_TEMP_PASSWORD_ENABLED; else process.env.STAFF_TEMP_PASSWORD_ENABLED = previous; });

  it("creates a direct account and returns a strong, unique temporary password exactly once, never writing it to the database or logs", async () => {
    const a = harness(); const b = harness();
    const first = await a.service.create(schoolAdmin(), ORG, direct);
    const second = await b.service.create(schoolAdmin(), ORG, direct);
    expect(first.accountState).toBe("password_change_required");
    expect(first.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    expect(first.email).toBe("ada@school.test");
    expect(new Date(first.temporaryPasswordExpiresAt!).getTime()).toBeGreaterThan(Date.now());
    const persisted = JSON.stringify([a.tx.$queryRaw.mock.calls, a.tx.$executeRaw.mock.calls, a.logs]);
    expect(persisted).not.toContain(first.temporaryPassword!);
    expect(a.writes.join("\n")).toContain("account.created");
    expect(a.supabase.createStaffIdentity).toHaveBeenCalledWith("ada@school.test", first.temporaryPassword);
  });

  it("refuses cross-school provisioning, instructors provisioning anyone, and school admins creating school admins (no escalation)", async () => {
    await expect(harness().service.create(schoolAdmin(OTHER), ORG, direct)).rejects.toBeInstanceOf(NotFoundException);
    await expect(harness().service.create(instructor, ORG, direct)).rejects.toBeInstanceOf(NotFoundException);
    await expect(harness().service.create(schoolAdmin(), ORG, { ...direct, role: "school_admin", employeeCode: undefined })).rejects.toBeInstanceOf(NotFoundException);
    const ok = await harness().service.create(sysAdmin, ORG, { ...direct, role: "school_admin", employeeCode: undefined });
    expect(ok.role).toBe("school_admin");
  });

  it("rejects a duplicate e-mail and an identity that already exists without changing anything", async () => {
    const dup = harness({ duplicateEmail: true });
    await expect(dup.service.create(schoolAdmin(), ORG, direct)).rejects.toBeInstanceOf(ConflictException);
    expect(dup.supabase.createStaffIdentity).not.toHaveBeenCalled();
    const raced = harness({ created: false });
    await expect(raced.service.create(schoolAdmin(), ORG, direct)).rejects.toBeInstanceOf(ConflictException);
    expect(raced.supabase.deleteStudentIdentity).not.toHaveBeenCalled(); // an existing identity is never deleted
    expect(raced.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("removes the Auth identity and reports failure when persistence fails (no half-created account, no false success)", async () => {
    const h = harness({ failInsert: true });
    await expect(h.service.create(schoolAdmin(), ORG, direct)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.supabase.deleteStudentIdentity).toHaveBeenCalledWith("auth-new");
    expect(JSON.stringify(h.logs)).not.toMatch(/[A-Za-z0-9_-]{32}/);
  });

  it("requires an employee code for instructors, rejects one for school admins, and closed/suspended schools", async () => {
    await expect(harness().service.create(schoolAdmin(), ORG, { ...direct, employeeCode: undefined })).rejects.toBeInstanceOf(BadRequestException);
    await expect(harness().service.create(sysAdmin, ORG, { ...direct, role: "school_admin" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(harness({ orgStatus: "suspended" }).service.create(schoolAdmin(), ORG, direct)).rejects.toBeInstanceOf(ConflictException);
  });

  it("direct creation is refused while the staff flag (and so the server-side gate) is off; invitation does not depend on it", async () => {
    process.env.STAFF_TEMP_PASSWORD_ENABLED = "false";
    const h = harness();
    await expect(h.service.create(schoolAdmin(), ORG, direct)).rejects.toBeInstanceOf(ConflictException);
    expect(h.supabase.createStaffIdentity).not.toHaveBeenCalled();
    const invited = await h.service.create(schoolAdmin(), ORG, { ...direct, method: "invite" });
    expect(invited.accountState).toBe("invited");
    expect(invited.temporaryPassword).toBeUndefined();
    expect(h.supabase.invite).toHaveBeenCalledWith("ada@school.test", "Ada Teacher");
  });

  it("cleans up an invitation whose application rows could not be saved", async () => {
    const h = harness({ failInsert: true });
    await expect(h.service.create(schoolAdmin(), ORG, { ...direct, method: "invite" })).rejects.toBeInstanceOf(BadRequestException);
    expect(h.supabase.deleteStudentIdentity).toHaveBeenCalledWith("auth-invited");
  });

  describe("recovery of existing accounts", () => {
    const pending = { id: "t1", auth_user_id: "auth-t", email: "p@school.test", full_name: "Pending", status: "invited", password_change_required: false, role_code: "instructor" };
    it("recovers a never-signed-in invited account in place (same auth id) and issues one-time credentials", async () => {
      const h = harness({ target: pending });
      const result = await h.service.recoverPending(schoolAdmin(), ORG, "t1");
      expect(h.supabase.setStudentPassword).toHaveBeenCalledWith("auth-t", result.temporaryPassword);
      expect(h.supabase.deleteStudentIdentity).not.toHaveBeenCalled();
      expect(h.supabase.createStaffIdentity).not.toHaveBeenCalled();
      expect(h.writes.join("\n")).toContain("password_change_required=true");
    });
    it("never overwrites the password of an account that is active, has signed in, or is already restricted", async () => {
      await expect(harness({ target: { ...pending, status: "active" } }).service.recoverPending(schoolAdmin(), ORG, "t1")).rejects.toBeInstanceOf(ConflictException);
      const signedIn = harness({ target: pending, lastSignInAt: "2026-11-01T00:00:00Z" });
      await expect(signedIn.service.recoverPending(schoolAdmin(), ORG, "t1")).rejects.toBeInstanceOf(ConflictException);
      expect(signedIn.supabase.setStudentPassword).not.toHaveBeenCalled();
      const permanent = harness({ target: { ...pending, status: "active", password_change_required: false } });
      await expect(permanent.service.resetTemporary(schoolAdmin(), ORG, "t1")).rejects.toBeInstanceOf(ConflictException);
      expect(permanent.supabase.setStudentPassword).not.toHaveBeenCalled();
    });
    it("a School Admin cannot recover or reset a School Admin, nor an account of another school", async () => {
      const admin = { ...pending, role_code: "school_admin" };
      await expect(harness({ target: admin }).service.recoverPending(schoolAdmin(), ORG, "t1")).rejects.toBeInstanceOf(NotFoundException);
      await expect(harness({ target: pending }).service.recoverPending(schoolAdmin(OTHER), ORG, "t1")).rejects.toBeInstanceOf(NotFoundException);
      await expect(harness({}).service.recoverPending(schoolAdmin(), ORG, "missing")).rejects.toBeInstanceOf(NotFoundException);
    });
    it("re-issues credentials only while the first-login change is still pending, and rotates sessions", async () => {
      const h = harness({ target: { ...pending, status: "active", password_change_required: true } });
      const result = await h.service.resetTemporary(schoolAdmin(), ORG, "t1");
      expect(result.temporaryPassword).toBeTruthy();
      expect(h.writes.join("\n")).toContain("password_changed_at=clock_timestamp()");
      expect(h.tx.$executeRaw.mock.calls.flat()).toContain("account.credentials_reset");
    });
  });
});
