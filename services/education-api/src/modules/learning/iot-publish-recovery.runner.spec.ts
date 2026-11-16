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

  it("contains a failed recovery cycle and allows the next interval to retry", async () => {
    const recoverOnce = jest.fn().mockRejectedValueOnce(new Error("database unavailable")).mockResolvedValueOnce(undefined);
    const warn = jest.fn();
    const runner = new IotPublishRecoveryRunner(
      { recoverOnce } as never,
      { VISTA_IOT_PUBLISH_RECOVERY_ENABLED: "true" } as NodeJS.ProcessEnv,
      { warn } as never,
    );

    await runner.runOnce();
    await runner.runOnce();

    expect(recoverOnce).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("iot_publish_recovery_failed"));
  });

  it("waits for an in-flight recovery before completing shutdown", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const runner = new IotPublishRecoveryRunner(
      { recoverOnce: jest.fn().mockReturnValue(pending) } as never,
      { VISTA_IOT_PUBLISH_RECOVERY_ENABLED: "true" } as NodeJS.ProcessEnv,
    );
    const cycle = runner.runOnce();
    let stopped = false;
    const shutdown = runner.onModuleDestroy().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await Promise.all([cycle, shutdown]);
    expect(stopped).toBe(true);
  });
});
