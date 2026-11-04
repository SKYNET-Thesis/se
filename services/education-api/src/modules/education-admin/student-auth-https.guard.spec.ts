import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { StudentAuthHttpsGuard } from "./student-auth-https.guard";

describe("StudentAuthHttpsGuard", () => {
  it("rejects insecure student authentication requests in production", () => {
    const previousEnvironment = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const guard = new StudentAuthHttpsGuard();
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ secure: false }) }),
    } as ExecutionContext;

    try {
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    } finally {
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });
});