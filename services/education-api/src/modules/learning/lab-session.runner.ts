import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { LabSessionService } from "./lab-session.service";

/** Expiry and recovery sweep for Classroom Lab Sessions. Off unless VISTA_LAB_SESSION_SWEEP_ENABLED=true; reads also reconcile their own classroom. */
@Injectable()
export class LabSessionRunner implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private stopping = false;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  constructor(
    private readonly sessions: LabSessionService,
    @Optional() @Inject("LAB_SESSION_ENV") environment: NodeJS.ProcessEnv = process.env,
    @Optional() @Inject("LAB_SESSION_LOG") private readonly log: Pick<Console, "warn"> = console,
  ) {
    this.enabled = environment.VISTA_LAB_SESSION_SWEEP_ENABLED === "true";
    const value = Number(environment.VISTA_LAB_SESSION_SWEEP_INTERVAL_MS ?? "30000");
    this.intervalMs = Number.isSafeInteger(value) && value >= 1000 ? value : 30000;
  }
  onModuleInit() { if (this.enabled) { void this.runOnce(); this.timer = setInterval(() => { void this.runOnce(); }, this.intervalMs); } }
  async onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); this.timer = undefined; await this.inFlight; }
  async runOnce() {
    if (!this.enabled || this.stopping || this.inFlight) return;
    this.inFlight = (async () => {
      try { await this.sessions.reconcile(); }
      catch (error) { this.log.warn(JSON.stringify({ event: "lab_session_sweep_failed", error: error instanceof Error ? error.message : "unknown" })); }
      finally { this.inFlight = undefined; }
    })();
    await this.inFlight;
  }
}
