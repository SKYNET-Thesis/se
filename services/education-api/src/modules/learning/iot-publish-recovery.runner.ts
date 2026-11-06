import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { IotPublishRecoveryService } from "./iot-publish-recovery.service";

@Injectable()
export class IotPublishRecoveryRunner implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  constructor(private readonly recovery: IotPublishRecoveryService, @Optional() @Inject("IOT_PUBLISH_RECOVERY_ENV") environment: NodeJS.ProcessEnv = process.env) {
    this.enabled = environment.VISTA_IOT_PUBLISH_RECOVERY_ENABLED === "true";
    const value = Number(environment.VISTA_IOT_PUBLISH_RECOVERY_INTERVAL_MS ?? "30000");
    this.intervalMs = Number.isSafeInteger(value) && value >= 1000 ? value : 30000;
  }
  onModuleInit() { if (this.enabled) { void this.runOnce(); this.timer = setInterval(() => { void this.runOnce(); }, this.intervalMs); } }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async runOnce() { if (!this.enabled || this.running) return; this.running = true; try { await this.recovery.recoverOnce(); } finally { this.running = false; } }
}
