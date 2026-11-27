import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../common/database/prisma.service";

/**
 * Release-compatibility probe for staged migration S (classroom_lab_sessions + many-to-many allocation).
 *
 * Supported combinations (see docs/education/wf-01-robot-resource-allocation.md, "Migration S release"):
 *   new API + old schema  — supported: allocation stays one robot per classroom, Lab Session endpoints answer 503 LAB_SESSION_SCHEMA_NOT_READY,
 *                           student execution behaves as before (no reservation exists yet, so none is enforced).
 *   new API + new schema  — supported: reservations are enforced.
 *   old API + old schema  — the currently deployed state.
 *   old API + new schema  — intentionally BLOCKED: the old allocation upsert uses ON CONFLICT (classroom_id) and fails with 42P10.
 * The deploy order is therefore: new API first, then migration S, never the reverse.
 */
@Injectable()
export class LabSessionSchemaProbe {
  private ready: { value: boolean; at: number } | null = null;
  constructor(private readonly prisma: PrismaService) {}

  async isReady(): Promise<boolean> {
    const now = Date.now();
    if (this.ready && now - this.ready.at < 15_000) return this.ready.value;
    let value = false;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ ready: boolean }>>`SELECT to_regclass('public.classroom_lab_sessions') IS NOT NULL AS ready`;
      value = rows[0]?.ready === true;
    } catch { value = false; }
    this.ready = { value, at: now };
    return value;
  }

  async require(): Promise<void> {
    if (!(await this.isReady())) {
      throw new ServiceUnavailableException({ code: "LAB_SESSION_SCHEMA_NOT_READY", message: "Classroom Lab Sessions are not available until the database migration is applied." });
    }
  }
}

/** A probe that is always ready; used where no probe is injected (unit tests that mock the data layer). */
export const alwaysReady = { isReady: async () => true, require: async () => undefined };
