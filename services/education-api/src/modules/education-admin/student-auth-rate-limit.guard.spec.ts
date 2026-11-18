import { ExecutionContext, HttpException } from "@nestjs/common";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";

const ctx = (ip: string, body?: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => ({ ip, body }) }) }) as ExecutionContext;
const rejected = (guard: StudentAuthRateLimitGuard, context: ExecutionContext) => { try { guard.canActivate(context); return false; } catch (error) { expect((error as HttpException).getStatus()).toBe(429); return true; } };

describe("StudentAuthRateLimitGuard", () => {
  afterEach(() => { delete process.env.STUDENT_AUTH_IP_LIMIT_PER_MINUTE; delete process.env.STUDENT_AUTH_ACCOUNT_LIMIT_PER_MINUTE; jest.useRealTimers(); });

  it("throttles one account to 10 attempts per minute no matter which address they come from", () => {
    const guard = new StudentAuthRateLimitGuard();
    for (let i = 0; i < 10; i += 1) expect(guard.canActivate(ctx(`198.51.100.${i}`, { schoolCode: "SCH", studentCode: "S1" }))).toBe(true);
    expect(rejected(guard, ctx("198.51.100.99", { schoolCode: "sch", studentCode: " s1 " }))).toBe(true); // case/space-insensitive identity
  });

  it("does not let a shared address (e.g. one CloudFront edge) block a classroom of different students", () => {
    const guard = new StudentAuthRateLimitGuard();
    for (let i = 0; i < 100; i += 1) expect(guard.canActivate(ctx("15.158.13.134", { schoolCode: "SCH", studentCode: `S${i}` }))).toBe(true);
  });

  it("still caps a single address against enumeration (default 120/min)", () => {
    const guard = new StudentAuthRateLimitGuard();
    for (let i = 0; i < 120; i += 1) guard.canActivate(ctx("203.0.113.10", { schoolCode: "SCH", studentCode: `E${i}` }));
    expect(rejected(guard, ctx("203.0.113.10", { schoolCode: "SCH", studentCode: "E999" }))).toBe(true);
  });

  it("limits address-only calls (no account in the body, e.g. the authenticated password change)", () => {
    process.env.STUDENT_AUTH_IP_LIMIT_PER_MINUTE = "5";
    const guard = new StudentAuthRateLimitGuard();
    for (let i = 0; i < 5; i += 1) expect(guard.canActivate(ctx("203.0.113.20", undefined))).toBe(true);
    expect(rejected(guard, ctx("203.0.113.20", {}))).toBe(true);
  });

  it("resets after the window and honours env overrides", () => {
    jest.useFakeTimers(); process.env.STUDENT_AUTH_ACCOUNT_LIMIT_PER_MINUTE = "2";
    const guard = new StudentAuthRateLimitGuard(); const c = ctx("203.0.113.30", { schoolCode: "SCH", studentCode: "S1" });
    guard.canActivate(c); guard.canActivate(c); expect(rejected(guard, c)).toBe(true);
    jest.advanceTimersByTime(61_000); expect(guard.canActivate(c)).toBe(true);
  });

  it("never rejects real users because the tracking table is full (evicts instead)", () => {
    const guard = new StudentAuthRateLimitGuard();
    for (let i = 0; i < 20_500; i += 1) guard.canActivate(ctx(`10.${i % 250}.${Math.floor(i / 250) % 250}.1`, { schoolCode: "SCH", studentCode: `F${i}` }));
    expect(guard.canActivate(ctx("192.0.2.1", { schoolCode: "SCH", studentCode: "LAST" }))).toBe(true);
  });
});
