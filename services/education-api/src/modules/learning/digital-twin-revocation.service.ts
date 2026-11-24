import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaService } from "../../common/database/prisma.service";
import { isTwinInternalEndpoint } from "./digital-twin-endpoint";

type Fetcher = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status?: number }>;
export interface RevocationScope { attemptIds?: string[]; userId?: string; organizationId?: string; classroomId?: string; robotId?: string }
export interface RevocationReport { requested: number; accepted: number; unavailable: number; rejected: number }

/**
 * Immediate revocation of Digital Twin viewers. The Education API tells the Twin to close the live viewers and drop the buffered frames of an
 * attempt the moment the right to watch it ends: final submission, member suspension, organization suspension/closure, account disable,
 * classroom archive, student removal or a different robot. It is best-effort and NEVER blocks or fails the business operation that caused it:
 * the 60-second viewer-scope TTL and the attempt check at scope issuance remain the backstop when the Twin is unreachable.
 * Delivery is retried with backoff (DIGITAL_TWIN_REVOKE_RETRY_MS, default 0,500,2000,5000 ms) on network errors and 5xx answers only; a 4xx is a
 * definitive refusal and is never retried. Signed with the same publisher scope as simulation telemetry (DIGITAL_TWIN_SCOPE_SECRET); the Twin must be on loopback/localhost.
 */
@Injectable()
export class DigitalTwinRevocationService {
  private readonly logger = new Logger(DigitalTwinRevocationService.name);
  private readonly environment: NodeJS.ProcessEnv;
  private readonly fetcher: Fetcher;

  constructor(private readonly prisma: PrismaService, @Optional() environment?: NodeJS.ProcessEnv, @Optional() fetcher?: Fetcher) {
    this.environment = environment ?? process.env;
    this.fetcher = fetcher ?? fetch;
  }

  /** Revokes the viewers of the attempts matching the scope. Without attemptIds only IN-PROGRESS attempts are considered. */
  async revoke(scope: RevocationScope): Promise<RevocationReport> {
    const report: RevocationReport = { requested: 0, accepted: 0, unavailable: 0, rejected: 0 };
    try {
      const rows = await this.resolve(scope);
      report.requested = rows.length;
      for (const row of rows) {
        const outcome = await this.send(row);
        report[outcome] += 1;
      }
      if (report.requested > 0) this.logger.log({ event: "digital_twin_viewers_revoked", ...report });
    } catch (error) {
      this.logger.warn({ event: "digital_twin_revocation_failed", error: error instanceof Error ? error.message : String(error) });
    }
    return report;
  }

  /**
   * Resolves WHICH viewers would be revoked now and returns the action that revokes them. Used when the mutation itself removes the information
   * (for example a different robot is allocated): call prepare() before the change, run the returned function after it commits.
   */
  async prepare(scope: RevocationScope): Promise<() => Promise<RevocationReport>> {
    let rows: Array<{ attempt_id: string; organization_id: string; robot_id: string }> = [];
    try { rows = await this.resolve(scope); } catch (error) { this.logger.warn({ event: "digital_twin_revocation_prepare_failed", error: error instanceof Error ? error.message : String(error) }); }
    return async () => {
      const report: RevocationReport = { requested: rows.length, accepted: 0, unavailable: 0, rejected: 0 };
      for (const row of rows) report[await this.send(row)] += 1;
      return report;
    };
  }

  private async resolve(scope: RevocationScope) {
    const filters: Prisma.Sql[] = [];
    if (scope.attemptIds?.length) filters.push(Prisma.sql`a.id = ANY(${scope.attemptIds}::uuid[])`);
    else filters.push(Prisma.sql`a.status = 'in_progress'`);
    if (scope.userId) filters.push(Prisma.sql`a.learner_user_id = ${scope.userId}::uuid`);
    if (scope.organizationId) filters.push(Prisma.sql`c.organization_id = ${scope.organizationId}::uuid`);
    if (scope.classroomId) filters.push(Prisma.sql`c.id = ${scope.classroomId}::uuid`);
    if (scope.robotId) filters.push(Prisma.sql`al.robot_id = ${scope.robotId}::uuid`);
    if (filters.length < 2 && !scope.attemptIds?.length) return [];                 // never revoke "everything" by accident
    return this.prisma.$queryRaw<Array<{ attempt_id: string; organization_id: string; robot_id: string }>>`
      SELECT a.id AS attempt_id, c.organization_id, al.robot_id
      FROM public.learning_assignment_attempts a
      JOIN public.learning_classroom_assignments ca ON ca.id = a.classroom_assignment_id
      JOIN public.learning_classrooms c ON c.id = ca.classroom_id
      JOIN public.learning_classroom_robot_allocations al ON al.classroom_id = c.id
      WHERE ${Prisma.join(filters, " AND ")}`;
  }

  private retryDelays(): number[] {
    const configured = (this.environment.DIGITAL_TWIN_REVOKE_RETRY_MS ?? "0,500,2000,5000").split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value >= 0 && value <= 60_000);
    return configured.length ? configured.slice(0, 8) : [0];
  }

  private async send(row: { attempt_id: string; organization_id: string; robot_id: string }): Promise<"accepted" | "unavailable" | "rejected"> {
    const secret = this.environment.DIGITAL_TWIN_SCOPE_SECRET?.trim();
    const endpoint = this.environment.DIGITAL_TWIN_TELEMETRY_URL?.trim();
    if (!secret || !endpoint || !isTwinInternalEndpoint(endpoint)) return "unavailable";
    for (const delay of this.retryDelays()) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      // A fresh token (unique jti, new expiry) for every delivery attempt.
      const payload = { aud: "vista-digital-twin-simulation-publisher", exp: Math.floor(Date.now() / 1000) + 60, jti: randomUUID(), kind: "simulation_publisher", org: row.organization_id, robots: [row.robot_id], sub: "education-api" };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
      try {
        const response = await this.fetcher(`${endpoint.replace(/\/$/, "")}/internal/revoke-attempt`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer v1.${encoded}.${signature}` },
          body: JSON.stringify({ organization_id: row.organization_id, robot_id: row.robot_id, attempt_id: row.attempt_id }), signal: AbortSignal.timeout(2000),
        });
        if (response.ok) return "accepted";
        if ((response.status ?? 500) < 500) return "rejected";   // definitive refusal: do not retry
      } catch { /* network failure: retry */ }
    }
    return "unavailable";
  }
}
