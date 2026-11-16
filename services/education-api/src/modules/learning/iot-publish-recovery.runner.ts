import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { IotPublishRecoveryService } from "./iot-publish-recovery.service";

@Injectable()
export class IotPublishRecoveryRunner implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private inFlight: Promise<void> | undefined;
  private stopping = false;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  constructor(
    private readonly recovery: IotPublishRecoveryService,
    @Optional() @Inject("IOT_PUBLISH_RECOVERY_ENV") environment: NodeJS.ProcessEnv = process.env,
    @Optional() @Inject("IOT_PUBLISH_RECOVERY_LOG") private readonly log: Pick<Console, "warn"> = console,
  ) {
    this.enabled = environment.VISTA_IOT_PUBLISH_RECOVERY_ENABLED === "true";
    const value = Number(environment.VISTA_IOT_PUBLISH_RECOVERY_INTERVAL_MS ?? "30000");
    this.intervalMs = Number.isSafeInteger(value) && value >= 1000 ? value : 30000;
  }
  onModuleInit() { if (this.enabled) { void this.runOnce(); this.timer = setInterval(() => { void this.runOnce(); }, this.intervalMs); } }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }
  async runOnce() {
    if (!this.enabled || this.running || this.stopping) return;
    this.running = true;
    this.inFlight = (async () => {
      try {
        await this.recovery.recoverOnce();
      } catch (error) {
        this.log.warn(JSON.stringify({ event: "iot_publish_recovery_failed", error: error instanceof Error ? error.message : "unknown" }));
      } finally {
        this.running = false;
      }
    })();
    await this.inFlight;
  }
}
