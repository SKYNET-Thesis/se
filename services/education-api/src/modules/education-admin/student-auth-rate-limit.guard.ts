import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Request } from "express";

type Bucket = { count: number; resetAt: number };

const readLimit = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1 && value <= 100_000 ? value : fallback;
};

/**
 * Rate limiting for the public student-auth endpoints (login / setup / recover / first-login password change).
 *
 * Two independent fixed one-minute windows, both process-local (Production runs a single API instance; counters reset on restart
 * and multiply with the instance count if the API is ever scaled out):
 *
 *  1. Per ACCOUNT (school code + student code, from the request body): the brute-force control. 10 attempts/minute per account from
 *     anywhere. This does not depend on knowing the client's IP, so it cannot be bypassed by spoofing X-Forwarded-For and it does not
 *     penalize other students.
 *  2. Per client address: a generous cap against enumeration (default 120/minute). Behind CloudFront the API sees the CloudFront edge
 *     address (TRUST_PROXY=1 trusts only nginx; verified against the nginx access log), which every user on that edge shares, so
 *     this bucket must NOT be tight. Do not "fix" that by raising TRUST_PROXY: with 2 trusted hops the direct api.skynex.best path
 *     would honour a client-supplied X-Forwarded-For entry.
 *
 * Trade-off: an attacker who knows a school code and student code can keep that one account's sign-in throttled (10/min). That is a
 * temporary nuisance, not a lock-out, and the account's recovery path (school-issued codes) is unaffected by IP.
 */
@Injectable()
export class StudentAuthRateLimitGuard implements CanActivate {
  private readonly windowMs = 60_000;
  private readonly maxEntries = 20_000;
  private readonly addressLimit = readLimit("STUDENT_AUTH_IP_LIMIT_PER_MINUTE", 120);
  private readonly accountLimit = readLimit("STUDENT_AUTH_ACCOUNT_LIMIT_PER_MINUTE", 10);
  private readonly byAddress = new Map<string, Bucket>();
  private readonly byAccount = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    this.consume(this.byAddress, request.ip || "unknown", this.addressLimit, now);
    const account = this.accountKey(request);
    if (account) this.consume(this.byAccount, account, this.accountLimit, now);
    return true;
  }

  private accountKey(request: Request): string | null {
    const body = request.body as { schoolCode?: unknown; studentCode?: unknown } | undefined;
    if (typeof body?.schoolCode !== "string" || typeof body?.studentCode !== "string") return null;
    const school = body.schoolCode.trim().toLowerCase().slice(0, 80);
    const student = body.studentCode.trim().toLowerCase().slice(0, 80);
    return school && student ? `${school}|${student}` : null;
  }

  private consume(store: Map<string, Bucket>, key: string, limit: number, now: number) {
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (store.size >= this.maxEntries) this.evict(store, now);
      bucket = { count: 0, resetAt: now + this.windowMs };
      store.set(key, bucket);
    }
    if (bucket.count >= limit) throw new HttpException("Too many sign-in attempts. Try again shortly.", HttpStatus.TOO_MANY_REQUESTS);
    bucket.count += 1;
  }

  /** Drop expired entries; if the table is still full, drop the oldest ones. Never reject real users because the table is full. */
  private evict(store: Map<string, Bucket>, now: number) {
    for (const [key, bucket] of store) if (bucket.resetAt <= now) store.delete(key);
    if (store.size < this.maxEntries) return;
    let toDrop = Math.ceil(this.maxEntries / 10);
    for (const key of store.keys()) { store.delete(key); if (--toDrop <= 0) break; }
  }
}
