import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { SupabaseAuthGuard } from "./supabase-auth.guard";
import { jwtVerify } from "jose";

jest.mock("jose", () => ({ jwtVerify: jest.fn(), createRemoteJWKSet: jest.fn(() => "fixture-jwks") }));
const mockJwtVerify = jwtVerify as jest.Mock;

const context = (authorization?: string) => {
  const request = { headers: { authorization } } as { headers: { authorization?: string }; user?: unknown };
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
};

describe("SupabaseAuthGuard JWKS contract", () => {
  const queryRaw = jest.fn();
  const config = { get: jest.fn((key: string) => ({
    SUPABASE_URL: "https://project.supabase.co", SUPABASE_JWT_AUDIENCE: "authenticated",
  })[key]) };
  const guard = new SupabaseAuthGuard(config as never, { $queryRaw: queryRaw } as never);

  beforeEach(() => { mockJwtVerify.mockReset(); queryRaw.mockReset(); config.get.mockClear(); });

  it("verifies issuer/audience, resolves JWT sub through auth_user_id, and builds CurrentUser", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000001" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-1", email: "student@vista.test", status: "active" }])
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

  it("rejects missing or invalid bearer tokens without a fallback identity", async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    mockJwtVerify.mockRejectedValue(new Error("signature"));
    await expect(guard.canActivate(context("Bearer invalid"))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("denies a disabled mapped VISTA account", async () => {
    mockJwtVerify.mockResolvedValue({ payload: { sub: "00000000-0000-0000-0000-000000000002" } });
    queryRaw.mockResolvedValueOnce([{ id: "user-2", email: "disabled@vista.test", status: "disabled" }]);
    await expect(guard.canActivate(context("Bearer signed"))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
