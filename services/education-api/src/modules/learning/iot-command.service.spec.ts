import { IotCommandService } from "./iot-command.service";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../../common/database/prisma.service";
import { IotPublishRecoveryService } from "./iot-publish-recovery.service";

describe("IotCommandService", () => {
  it("constructs through Nest without application-specific clock providers", async () => {
    const module = await Test.createTestingModule({ providers: [IotCommandService] }).compile();

    expect(module.get(IotCommandService).enabled()).toBe(false);
  });

  it("constructs the IoT recovery worker through Nest with its Prisma provider", async () => {
    const module = await Test.createTestingModule({
      providers: [
        IotCommandService,
        IotPublishRecoveryService,
        { provide: PrismaService, useValue: { $transaction: jest.fn() } },
      ],
    }).compile();

    expect(module.get(IotPublishRecoveryService)).toBeInstanceOf(IotPublishRecoveryService);
  });

  it("creates a correlated command envelope before publishing it", async () => {
    const publish = jest.fn();
    const service = new IotCommandService(
      { VISTA_IOT_TOPIC_PREFIX: "vista/demo/robots", VISTA_IOT_COMMAND_TTL_MS: "5000" } as NodeJS.ProcessEnv,
      { publish } as never,
      () => 1_000,
      () => "command-before-publish",
    );
    const command = service.createRunCommand("so101-001", 7, { runId: "run-1" });
    expect(command).toEqual(expect.objectContaining({ commandId: "command-before-publish", expiresAtMs: 6_000 }));
    expect(publish).not.toHaveBeenCalled();
  });

  it("publishes a bounded, correlated run envelope to the configured robot topic", async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const service = new IotCommandService(
      { VISTA_IOT_TOPIC_PREFIX: "vista/demo/robots", VISTA_IOT_COMMAND_TTL_MS: "5000" } as NodeJS.ProcessEnv,
      { publish } as never,
      () => 1_000,
      () => "command-1",
    );
    const command = await service.publishRun("so101-001", 7, { runId: "run-1" });
    expect(command).toEqual(expect.objectContaining({ commandId: "command-1", sequence: 7, expiresAtMs: 6_000, robotId: "so101-001", kind: "run" }));
    expect(publish).toHaveBeenCalledWith("vista/demo/robots/so101-001/commands", expect.objectContaining({ payload: { runId: "run-1" } }));
  });
});
