import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { IdentityController } from "./identity.controller";
import { IdentityService } from "./identity.service";
import { SupabaseAuthGuard } from "./auth/supabase-auth.guard";

const user = { authUserId: "auth-1", vistaUserId: "user-1", email: "learner@example.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [{ id: "m-1", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write"] }] };
class FixtureJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: unknown }>();
    if (request.headers.authorization === "Bearer invalid") throw new UnauthorizedException("Invalid or expired Supabase access token.");
    if (request.headers.authorization !== "Bearer valid") throw new UnauthorizedException("A Supabase Bearer access token is required.");
    request.user = user; return true;
  }
}

describe("Identity HTTP boundary", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [IdentityController], providers: [{ provide: IdentityService, useValue: { getMe: jest.fn().mockResolvedValue({ id: "user-1", email: user.email, fullName: "Learner" }), getMyRoles: jest.fn().mockReturnValue({ systemRoleCodes: [], memberships: [] }), getMyPermissions: jest.fn().mockReturnValue({ system: { roleCodes: [], permissionCodes: [] }, memberships: [] }), getMyMemberships: jest.fn().mockReturnValue([]), updateMyProfile: jest.fn() } }] }).overrideGuard(SupabaseAuthGuard).useClass(FixtureJwtGuard).compile();
    app = module.createNestApplication(); app.setGlobalPrefix("api/v1"); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
  });
  afterAll(async () => app.close());
  it("rejects no token and invalid token at HTTP level", async () => {
    await request(app.getHttpServer()).get("/api/v1/me").expect(401);
    await request(app.getHttpServer()).get("/api/v1/me").set("Authorization", "Bearer invalid").expect(401);
  });
  it("maps the authenticated fixture identity to /me", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/me").set("Authorization", "Bearer valid").expect(200);
    expect(response.body).toMatchObject({ id: "user-1", email: user.email });
  });
  it("rejects malformed profile DTOs before the service", async () => {
    await request(app.getHttpServer()).patch("/api/v1/me/profile").set("Authorization", "Bearer valid").send({ fullName: 3, status: "disabled" }).expect(400);
  });
});
