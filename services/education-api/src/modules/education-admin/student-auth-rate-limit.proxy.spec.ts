import { Body, Controller, INestApplication, Post, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";

@Controller("auth/students")
@UseGuards(StudentAuthRateLimitGuard)
class ProbeController {
  @Post("login") login(@Body() _body: unknown) { return { ok: true }; }
}

/**
 * The real Express request pipeline with the production proxy setting (TRUST_PROXY=1) and the exact forwarded-for chains measured in
 * Production (nginx access log): through CloudFront the chain is "<client-supplied…>, <viewer>, <edge>"; direct to nginx it is
 * "<client-supplied…>, <client>". These tests pin the properties that make the limiter safe on that topology.
 */
describe("student-auth rate limiting behind CloudFront + nginx (TRUST_PROXY=1)", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [ProbeController], providers: [StudentAuthRateLimitGuard] }).compile();
    app = module.createNestApplication();
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set("trust proxy", 1);
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  const login = (xff: string, body: Record<string, string>) => request(app.getHttpServer()).post("/auth/students/login").set("X-Forwarded-For", xff).send(body);

  it("lets a whole classroom behind ONE CloudFront edge sign in (the shared edge address is not the bottleneck)", async () => {
    for (let i = 0; i < 40; i += 1) {
      const response = await login(`198.51.100.${i}, 15.158.13.134`, { schoolCode: "SCH", studentCode: `S${i}` }); // viewer i via the same edge
      expect(response.status).toBe(201);
    }
  });

  it("throttles one account across different viewers/edges and ignores a forged X-Forwarded-For prefix", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await login(`6.6.6.${i}, 203.0.113.${i}, 15.158.13.${i}`, { schoolCode: "SCH2", studentCode: "TARGET" })).status);
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]); // the account bucket cannot be dodged by rotating addresses or forging headers
  });

  it("does not let one account's throttling affect other students", async () => {
    for (let i = 0; i < 12; i += 1) await login("203.0.113.9, 15.158.13.134", { schoolCode: "SCH3", studentCode: "ONE" });
    expect((await login("203.0.113.9, 15.158.13.134", { schoolCode: "SCH3", studentCode: "TWO" })).status).toBe(201);
  });
});
