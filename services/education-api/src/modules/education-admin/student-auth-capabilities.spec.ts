import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { StudentAuthController } from "./student-auth.controller";
import { StudentAuthService } from "./student-auth.service";
import { StudentAuthHttpsGuard } from "./student-auth-https.guard";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";

describe("GET /auth/students/capabilities", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [StudentAuthController], providers: [{ provide: StudentAuthService, useValue: {} }, StudentAuthHttpsGuard, StudentAuthRateLimitGuard] })
      .overrideGuard(require("../identity/auth/supabase-auth.guard").SupabaseAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => { await app.close(); delete process.env.STUDENT_TEMP_PASSWORD_ENABLED; });

  it("reports the server's actual state without authentication, exposes nothing else and is not cached", async () => {
    delete process.env.STUDENT_TEMP_PASSWORD_ENABLED;
    const off = await request(app.getHttpServer()).get("/auth/students/capabilities");
    expect(off.status).toBe(200); expect(off.body).toEqual({ temporaryPasswordEnabled: false });
    expect(off.headers["cache-control"]).toContain("no-store");
    process.env.STUDENT_TEMP_PASSWORD_ENABLED = "true";
    const on = await request(app.getHttpServer()).get("/auth/students/capabilities");
    expect(on.body).toEqual({ temporaryPasswordEnabled: true });
    process.env.STUDENT_TEMP_PASSWORD_ENABLED = "false";
    expect((await request(app.getHttpServer()).get("/auth/students/capabilities")).body).toEqual({ temporaryPasswordEnabled: false });
  });
});
