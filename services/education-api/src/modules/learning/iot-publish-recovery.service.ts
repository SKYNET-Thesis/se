import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { IotCommandService, IotPublishDefiniteFailureError, IotRunCommand } from "./iot-command.service";

type Claimed = { command_id: string; robot_id: string; issued_at: Date; expires_at: Date; command_payload: Record<string, unknown>; publish_owner: string };

/** Reconciles only commands whose database state proves no publish was attempted. */
@Injectable()
export class IotPublishRecoveryService {
  constructor(private readonly prisma: Pick<PrismaService, "$transaction">, private readonly iot: IotCommandService, private readonly now: () => number = () => Date.now(), private readonly owner: () => string = () => crypto.randomUUID()) {}
  async recoverOnce(limit = 10) {
    const now = this.now();
    const owner = this.owner();
    const claimed = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`UPDATE public.iot_command_lifecycles SET state='timed_out',completed_at=now(),updated_at=now(),error_code='publish_expired'
        WHERE state='pending_publish' AND expires_at <= to_timestamp(${now}::double precision/1000)`);
      await tx.$executeRaw(Prisma.sql`UPDATE public.iot_command_lifecycles SET state='reconciliation_required',updated_at=now(),publish_error='publish_outcome_unknown'
        WHERE state='publishing' AND publish_lease_until <= to_timestamp(${now}::double precision/1000)`);
      return tx.$queryRaw<Claimed[]>(Prisma.sql`WITH candidates AS (
          SELECT command_id FROM public.iot_command_lifecycles WHERE state='pending_publish'
            AND publish_attempts=0 AND expires_at > to_timestamp(${now}::double precision/1000)
            AND issued_at <= to_timestamp(${now - 30_000}::double precision/1000)
          ORDER BY issued_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
        ) UPDATE public.iot_command_lifecycles lifecycle SET state='publishing',publish_attempts=1,publish_owner=${owner},publish_started_at=now(),publish_lease_until=to_timestamp(${now + 30_000}::double precision/1000),updated_at=now()
        FROM candidates WHERE lifecycle.command_id=candidates.command_id
        RETURNING lifecycle.command_id,lifecycle.robot_id,lifecycle.issued_at,lifecycle.expires_at,lifecycle.command_payload,lifecycle.publish_owner`);
    });
    for (const row of claimed) {
      const command: IotRunCommand = { schemaVersion: 1, kind: "run", commandId: row.command_id, robotId: row.robot_id, sequence: row.issued_at.getTime(), issuedAtMs: row.issued_at.getTime(), expiresAtMs: row.expires_at.getTime(), payload: row.command_payload };
      try { await this.iot.publishRunCommand(command); await this.complete(row.command_id, row.publish_owner); }
      catch (error) {
        if (error instanceof IotPublishDefiniteFailureError) await this.failed(row.command_id, row.publish_owner);
        else await this.unknown(row.command_id, row.publish_owner);
      }
    }
    return claimed.length;
  }
  private async complete(commandId: string, owner: string) { await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`UPDATE public.iot_command_lifecycles SET state='queued',publish_lease_until=NULL,updated_at=now() WHERE command_id=${commandId} AND state='publishing' AND publish_owner=${owner}`)); }
  private async unknown(commandId: string, owner: string) { await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`UPDATE public.iot_command_lifecycles SET state='reconciliation_required',publish_lease_until=NULL,publish_error='publish_outcome_unknown',updated_at=now() WHERE command_id=${commandId} AND state='publishing' AND publish_owner=${owner}`)); }
  private async failed(commandId: string, owner: string) { await this.prisma.$transaction((tx) => tx.$executeRaw(Prisma.sql`UPDATE public.iot_command_lifecycles SET state='publish_failed',publish_lease_until=NULL,publish_error='publish_failed',updated_at=now() WHERE command_id=${commandId} AND state='publishing' AND publish_owner=${owner}`)); }
}
