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

  describe("simulation start mode and Device Shadow reads", () => {
    const base = { VISTA_IOT_ENABLED: "true", VISTA_IOT_TOPIC_PREFIX: "vista/demo/robots", VISTA_IOT_THING_PREFIX: "vista-demo" } as NodeJS.ProcessEnv;
    const publisher = { publish: jest.fn() } as never;
    it("is off unless VISTA_IOT_START_MODE=simulation and a shadow reader exists", () => {
      const reader = { read: jest.fn() };
      expect(new IotCommandService(base, publisher, undefined, undefined, reader).simulationStartEnabled()).toBe(false);
      expect(new IotCommandService({ ...base, VISTA_IOT_START_MODE: "physical" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader).simulationStartEnabled()).toBe(false);
      expect(new IotCommandService({ ...base, VISTA_IOT_START_MODE: "simulation" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader).simulationStartEnabled()).toBe(true);
    });
    it("reads only the named robot's Thing shadow", async () => {
      const reader = { read: jest.fn().mockResolvedValue({ connection: "connected" }) };
      const service = new IotCommandService({ ...base, VISTA_IOT_START_MODE: "simulation" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader);
      await expect(service.readShadow("11111111-1111-4111-8111-111111111111")).resolves.toEqual({ connection: "connected" });
      expect(reader.read).toHaveBeenCalledWith("vista-demo-11111111-1111-4111-8111-111111111111");
    });
    it("requires the Thing prefix and bounds the shadow age", async () => {
      const reader = { read: jest.fn() };
      const noPrefix = new IotCommandService({ VISTA_IOT_ENABLED: "true", VISTA_IOT_START_MODE: "simulation" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader);
      await expect(noPrefix.readShadow("r")).rejects.toThrow(/VISTA_IOT_THING_PREFIX/);
      expect(() => new IotCommandService({ ...base, VISTA_IOT_SHADOW_MAX_AGE_MS: "10" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader).shadowMaxAgeMs()).toThrow(/5000..300000/);
      expect(new IotCommandService(base, publisher, undefined, undefined, reader).shadowMaxAgeMs()).toBe(30000);
    });
  });

  describe("physical commissioning policy", () => {
    const base = { VISTA_IOT_ENABLED: "true", VISTA_IOT_START_MODE: "physical_commissioning", VISTA_IOT_THING_PREFIX: "vista-demo" } as NodeJS.ProcessEnv;
    const publisher = { publish: jest.fn() } as never; const reader = { read: jest.fn() };
    const full = { ...base, VISTA_PHYSICAL_COMMISSIONING_ROBOT_ID: "ABC", VISTA_PHYSICAL_COMMISSIONING_USER_IDS: "u1, u2", VISTA_PHYSICAL_COMMISSIONING_UNTIL: "2030-01-01T00:00:00Z", VISTA_PHYSICAL_RUNTIME_MODES: "so101_follower" } as NodeJS.ProcessEnv;
    it("is selected only by VISTA_IOT_START_MODE=physical_commissioning and is never the simulation mode", () => {
      const svc = new IotCommandService(full, publisher, undefined, undefined, reader);
      expect(svc.physicalStartEnabled()).toBe(true); expect(svc.simulationStartEnabled()).toBe(false);
      expect(new IotCommandService({ ...full, VISTA_IOT_START_MODE: "simulation" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader).physicalStartEnabled()).toBe(false);
      expect(new IotCommandService({ ...full, VISTA_IOT_ENABLED: "false", VISTA_IOT_START_MODE: "physical_commissioning" } as NodeJS.ProcessEnv, undefined, undefined, undefined, reader).physicalStartEnabled()).toBe(false);
    });
    it("normalizes the explicit authorization and requires every part of it", () => {
      const policy = new IotCommandService(full, publisher, undefined, undefined, reader).physicalCommissioningPolicy();
      expect(policy.robotId).toBe("abc"); expect([...policy.userIds]).toEqual(["u1", "u2"]); expect(policy.untilMs).toBe(Date.parse("2030-01-01T00:00:00Z")); expect([...policy.runtimeModes]).toEqual(["so101_follower"]);
      for (const key of ["VISTA_PHYSICAL_COMMISSIONING_ROBOT_ID", "VISTA_PHYSICAL_COMMISSIONING_USER_IDS", "VISTA_PHYSICAL_COMMISSIONING_UNTIL", "VISTA_PHYSICAL_RUNTIME_MODES"]) {
        expect(() => new IotCommandService({ ...full, [key]: "" } as NodeJS.ProcessEnv, publisher, undefined, undefined, reader).physicalCommissioningPolicy()).toThrow(/not fully configured/);
      }
    });
  });

  describe("shadow reader wiring from the environment (no injected reader)", () => {
    const env = { VISTA_IOT_ENABLED: "true", VISTA_IOT_DATA_ENDPOINT: "example-ats.iot.ap-southeast-1.amazonaws.com", VISTA_IOT_THING_PREFIX: "vista-demo", AWS_REGION: "ap-southeast-1" };
    const publisher = { publish: jest.fn() } as never;
    it.each([["simulation", "simulationStartEnabled"], ["physical_commissioning", "physicalStartEnabled"]] as const)("creates the AWS shadow reader for %s so that mode can actually start", (mode, method) => {
      expect(new IotCommandService({ ...env, VISTA_IOT_START_MODE: mode } as NodeJS.ProcessEnv, publisher)[method]()).toBe(true);
    });
    it("creates no shadow reader (all start modes off) without a start mode", () => {
      const service = new IotCommandService(env as NodeJS.ProcessEnv, publisher);
      expect(service.simulationStartEnabled()).toBe(false); expect(service.physicalStartEnabled()).toBe(false);
    });
  });
});
