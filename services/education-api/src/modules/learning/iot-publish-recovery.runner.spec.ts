import { IotPublishRecoveryRunner } from "./iot-publish-recovery.runner";

describe("IotPublishRecoveryRunner", () => {
  it("runs enabled recovery once at startup and never overlaps cycles", async () => {
    let release!: () => void;
    const running = new Promise<void>((resolve) => { release = resolve; });
    const recoverOnce = jest.fn().mockImplementation(() => running);
    const runner = new IotPublishRecoveryRunner({ recoverOnce } as never, { VISTA_IOT_PUBLISH_RECOVERY_ENABLED: "true", VISTA_IOT_PUBLISH_RECOVERY_INTERVAL_MS: "1000" } as NodeJS.ProcessEnv);
    runner.onModuleInit();
    await Promise.resolve();
    await runner.runOnce();
    expect(recoverOnce).toHaveBeenCalledTimes(1);
    release();
    await runner.onModuleDestroy();
  });

  it("does not start a loop when the feature flag is off", async () => {
    const recoverOnce = jest.fn();
    const runner = new IotPublishRecoveryRunner({ recoverOnce } as never, {} as NodeJS.ProcessEnv);
    runner.onModuleInit();
    await Promise.resolve();
    expect(recoverOnce).not.toHaveBeenCalled();
  });
});
