import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { SupabaseAuthGuard } from "./supabase-auth.guard";
import { jwtVerify } from "jose";

jest.mock("jose", () => ({ jwtVerify: jest.fn(), createRemoteJWKSet: jest.fn(() => "fixture-jwks") }));
const mockJwtVerify = jwtVerify as jest.Mock;
const context = (authorization?: string, handler: unknown = {}) => {
  const request = { headers: { authorization } } as { headers: { authorization?: string }; user?: unknown };
  return { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => handler, getClass: () => ({}) } as any;
};

describe("SupabaseAuthGuard JWKS and temporary password gate", () => {
  beforeAll(() => { process.env.STUDENT_TEMP_PASSWORD_ENABLED = "true"; });
  afterAll(() => { delete process.env.STUDENT_TEMP_PASSWORD_ENABLED; });
  const queryRaw = jest.fn(); const executeRaw = jest.fn();
  const config = { get: jest.fn((key: string) => ({
    SUPABASE_URL: "https://project.supabase.co", SUPABASE_JWT_AUDIENCE: "authenticated",
  })[key]) };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new SupabaseAuthGuard(config as never, { $queryRaw: queryRaw, $executeRaw: executeRaw } as never, reflector as never);

  beforeEach(() => { mockJwtVerify.mockReset(); queryRaw.mockReset(); executeRaw.mockReset().mockResolvedValue(1); config.get.mockClear(); reflector.getAllAndOverride.mockReset(); });

  it("verifies issuer/audience, resolves JWT sub through auth_user_id, and builds CurrentUser", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000001" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-1", email: "student@vista.test", status: "active", password_change_required: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ membership_id: "m-1", organization_id: "org-1", status: "active", role_code: "student", permission_code: "learning.work.write" }]);
    const executionContext = context("Bearer signed-supabase-token");
    const request = executionContext.switchToHttp().getRequest();
    await expect(guard.canActivate(executionContext)).resolves.toBe(true);
    expect(mockJwtVerify).toHaveBeenCalledWith("signed-supabase-token", "fixture-jwks", {
      issuer: "https://project.supabase.co/auth/v1", audience: "authenticated",
    });
    expect(request.user).toMatchObject({ authUserId: "00000000-0000-0000-0000-000000000001", vistaUserId: "user-1" });
  });

  describe("invited -> active (privilege-escalation guard)", () => {
    const sub = "00000000-0000-0000-0000-000000000009";
    const invitedUser = () => queryRaw.mockResolvedValueOnce([{ id: "user-9", email: "teacher@vista.test", status: "invited", password_change_required: false }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const run = async (claims: Record<string, unknown>) => {
      mockJwtVerify.mockResolvedValue({ payload: { sub, ...claims } }); invitedUser();
      const ctx = context("Bearer signed"); await guard.canActivate(ctx);
      return ctx.switchToHttp().getRequest().user.status as string;
    };

    it("activates only when the conditional statement confirms the invitation (1 row updated)", async () => {
      executeRaw.mockResolvedValue(1);
      expect(await run({ email: "Teacher@Vista.test", role: "authenticated" })).toBe("active");
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });

    it("stays invited when the database refuses the promotion (no membership, inactive organization, self-registered, other subject, e-mail mismatch)", async () => {
      executeRaw.mockResolvedValue(0);
      expect(await run({ email: "teacher@vista.test" })).toBe("invited");
    });

    it("the promotion statement itself enforces admin-created, subject link, e-mail match, active membership, active organization and a non-student role", async () => {
      executeRaw.mockResolvedValue(1);
      await run({ email: "teacher@vista.test" });
      const sql = (executeRaw.mock.calls[0][0] as string[]).join("?");
      for (const required of ["u.status='invited'", "u.signup_method='admin_created'", "u.auth_user_id=", "lower(u.email)=", "m.status='active'", "o.status='active'", "r.code IN ('instructor','school_admin')"]) expect(sql).toContain(required);
    });

    it.each([
      ["no e-mail claim", {}],
      ["anonymous identity", { email: "teacher@vista.test", is_anonymous: true }],
      ["non-authenticated role claim", { email: "teacher@vista.test", role: "service_role" }],
    ])("never attempts activation for %s", async (_name, claims) => {
      expect(await run(claims)).toBe("invited");
      expect(executeRaw).not.toHaveBeenCalled();
    });
  });

  it("does not touch accounts that are already active", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000010", email: "a@vista.test" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-10", email: "a@vista.test", status: "active", password_change_required: false }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await guard.canActivate(context("Bearer signed"));
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid bearer tokens without a fallback identity", async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    mockJwtVerify.mockRejectedValue(new Error("signature"));
    await expect(guard.canActivate(context("Bearer invalid"))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("denies a disabled mapped VISTA account", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000002" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-2", email: "disabled@vista.test", status: "disabled", password_change_required: false }]);
    await expect(guard.canActivate(context("Bearer signed"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("blocks restricted students from protected routes", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000003" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-3", email: "new@vista.test", status: "active", password_change_required: true }]);
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(context("Bearer signed"))).rejects.toMatchObject({
      response: { code: "PASSWORD_CHANGE_REQUIRED" },
    });
  });

  it("allows restricted students only on explicitly allowlisted password-change routes", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000004" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-4", email: "new@vista.test", status: "active", password_change_required: true }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    reflector.getAllAndOverride.mockReturnValue(true);
    await expect(guard.canActivate(context("Bearer signed", { name: "changePassword" }))).resolves.toBe(true);
  });


  it("rejects old access tokens after the server-side password-change cutoff", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000006", iat: 1_800_000_000 } });
    queryRaw.mockResolvedValueOnce([{ id: "user-6", email: "new@vista.test", status: "active", password_change_required: false, password_changed_at: new Date(1_800_000_001_000) }]);
    await expect(guard.canActivate(context("Bearer old-token"))).rejects.toMatchObject({ response: { code: "SESSION_ROTATED" } });
  });

  it("accepts a token issued after the password-change cutoff (Supabase tokens carry iat, not auth_time)", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000007", iat: 1_800_000_010 } });
    queryRaw.mockResolvedValueOnce([{ id: "user-7", email: "new@vista.test", status: "active", password_change_required: false, password_changed_at: new Date(1_800_000_001_000) }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(context("Bearer fresh-token"))).resolves.toBe(true);
  });

  it("keeps existing accounts unrestricted when the dormant flag is false", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000005" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-5", email: "existing@vista.test", status: "active", password_change_required: false }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(context("Bearer signed"))).resolves.toBe(true);
  });

  it("reads no temporary-password columns while the rollout flag is off (deploy-before-migrate safe)", async () => {
    delete process.env.STUDENT_TEMP_PASSWORD_ENABLED;
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000008", iat: 1_800_000_010 } });
    queryRaw.mockResolvedValueOnce([{ id: "user-8", email: "existing@vista.test", status: "active", password_change_required: false, password_changed_at: null, temporary_password_expires_at: null }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    reflector.getAllAndOverride.mockReturnValue(false);
    await expect(guard.canActivate(context("Bearer signed"))).resolves.toBe(true);
    const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(sql).not.toContain("education_school_user_profiles");
    expect(sql).not.toContain("password_change_required = true");
  });
});
