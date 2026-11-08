import { ExecutionContext, HttpException } from "@nestjs/common";
import { StudentAuthRateLimitGuard } from "./student-auth-rate-limit.guard";

describe("StudentAuthRateLimitGuard", () => {
  it("limits repeated student-auth attempts from the same IP", () => {
    const guard = new StudentAuthRateLimitGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ ip: "203.0.113.10" }) }),
    } as ExecutionContext;

    for (let attempt = 0; attempt < 10; attempt += 1) expect(guard.canActivate(context)).toBe(true);
    try {
      guard.canActivate(context);
      throw new Error("Expected rate limiting to reject the request.");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });
});