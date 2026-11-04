import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";

@Injectable()
export class StudentAuthRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs = 60_000;
  private readonly maxAttempts = 10;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = request.ip || "unknown";
    let entry = this.attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.attempts.size >= 10_000) {
        for (const [candidate, value] of this.attempts) {
          if (value.resetAt <= now) this.attempts.delete(candidate);
        }
      }
      if (this.attempts.size >= 10_000) throw new HttpException("Too many sign-in attempts. Try again shortly.", HttpStatus.TOO_MANY_REQUESTS);
      entry = { count: 0, resetAt: now + this.windowMs };
      this.attempts.set(key, entry);
    }
    if (entry.count >= this.maxAttempts) throw new HttpException("Too many sign-in attempts. Try again shortly.", HttpStatus.TOO_MANY_REQUESTS);
    entry.count += 1;
    return true;
  }
}