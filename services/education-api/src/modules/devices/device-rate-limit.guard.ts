import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";

type Bucket = { count: number; resetAt: number };

const readLimit = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1 && value <= 100_000 ? value : fallback;
};

/**
 * Process-local fixed one-minute windows for the PUBLIC device endpoints (same trade-offs as the student-auth limiter):
 * per device id (DEVICE_AUTH_LIMIT_PER_MINUTE, default 10; the brute-force control, independent of the client address) and per address (DEVICE_IP_LIMIT_PER_MINUTE, default 120).
 */
@Injectable()
export class DeviceRateLimitGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly byDevice = new Map<string, Bucket>();
  private readonly byAddress = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    this.consume(this.byAddress, request.ip ?? "unknown", readLimit("DEVICE_IP_LIMIT_PER_MINUTE", 120), now);
    const deviceId = (request.body as { deviceId?: unknown } | undefined)?.deviceId;
    if (typeof deviceId === "string" && deviceId) this.consume(this.byDevice, deviceId.toLowerCase(), readLimit("DEVICE_AUTH_LIMIT_PER_MINUTE", 10), now);
    return true;
  }

  private consume(store: Map<string, Bucket>, key: string, limit: number, now: number) {
    if (store.size > 10_000) for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) { bucket = { count: 0, resetAt: now + this.windowMs }; store.set(key, bucket); }
    bucket.count += 1;
    if (bucket.count > limit) throw new HttpException("Too many requests. Try again shortly.", HttpStatus.TOO_MANY_REQUESTS);
  }
}
