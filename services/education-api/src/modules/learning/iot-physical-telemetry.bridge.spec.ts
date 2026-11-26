import { IotPhysicalTelemetryBridge, isPhysicalTelemetryEvent } from "./iot-physical-telemetry.bridge";
import { IotTelemetryBridge } from "./iot-telemetry.bridge";

const ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9", CMD = "11111111-1111-4111-8111-111111111111", EXP = "22222222-2222-4222-8222-222222222222", ORG = "33333333-3333-4333-8333-333333333333", USER = "f9eb7496-9369-449f-9b9f-9368122fa410";
const NOW = 1_800_000_000_000;
const obs = (over: Record<string, unknown> = {}) => ({ "shoulder_pan.pos": 1, "shoulder_lift.pos": -20, "elbow_flex.pos": 35.5, "wrist_flex.pos": 10, "wrist_roll.pos": -5, "gripper.pos": 40, ...over });
const event = (over: Record<string, unknown> = {}) => ({ schemaVersion: 1, kind: "status", status: "physical_telemetry", robotId: ROBOT, commandId: CMD, eventId: `${CMD}:physical:${over.sequence ?? 10}`, sequence: 10, occurredAtMs: NOW - 100, adapterMode: "so101_follower", measuredAt: new Date(NOW - 150).toISOString(), observation: obs(), ...over });
const row = (over: Record<string, unknown> = {}) => ({ robot_id: ROBOT, state: "executing", experiment_id: EXP, organization_id: ORG, learner_user_id: USER, attempt_id: "44444444-4444-4444-8444-444444444444", runtime_mode: "so101_follower", execution_mode: "real_robot", ...over });
const policy = (over: Record<string, unknown> = {}) => () => ({ robotId: ROBOT, userIds: new Set([USER]), untilMs: NOW + 3_600_000, runtimeModes: new Set(["so101_follower"]), ...over });
const build = (rows: unknown[] = [row()], twinStatus = "accepted", pol: (() => never) | (() => ReturnType<ReturnType<typeof policy>>) | null = policy() as never, owner = "owner-1") => {
  const db = { $queryRaw: jest.fn().mockResolvedValue(rows) }; const twin = { publishPhysical: jest.fn().mockResolvedValue({ status: twinStatus }) };
  return { bridge: new IotPhysicalTelemetryBridge(db as never, twin as never, pol as never, owner, () => NOW, {} as NodeJS.ProcessEnv), db, twin };
};

describe("IotPhysicalTelemetryBridge (synthetic fixtures: software contract only, not physical acceptance)", () => {
  it("recognizes only physical_telemetry and never the simulation message", () => {
    expect(isPhysicalTelemetryEvent(event())).toBe(true); expect(isPhysicalTelemetryEvent({ kind: "status", status: "telemetry" })).toBe(false);
  });
  it("forwards an authorized frame with identity taken from the server's records, not the payload", async () => {
    const { bridge, twin } = build();
    await expect(bridge.handle(event({ organizationId: "evil", experimentId: "evil", userId: "evil" }))).resolves.toBe("forwarded");
    expect(twin.publishPhysical).toHaveBeenCalledWith({ ownerId: "owner-1", organizationId: ORG, robotId: ROBOT, measuredAt: new Date(NOW - 150).toISOString(), observation: obs() });
  });
  it.each([
    ["a robot that is not the approved robot", event({ robotId: "99999999-9999-4999-8999-999999999999" }), "robot_not_approved"],
    ["a malformed envelope", event({ eventId: undefined }), "malformed"],
    ["a missing adapter mode", event({ adapterMode: undefined }), "malformed"],
    ["a stale event", event({ occurredAtMs: NOW - 60_000 }), "stale"],
    ["a future event", event({ occurredAtMs: NOW + 60_000 }), "future"],
    ["a stale measurement", event({ measuredAt: new Date(NOW - 60_000).toISOString() }), "measurement_stale"],
    ["an unparsable measurement time", event({ measuredAt: "yesterday" }), "measured_at"],
    ["a missing joint", event({ observation: { ...obs(), "wrist_roll.pos": undefined } }), "invalid_observation"],
    ["a NaN joint", event({ observation: obs({ "elbow_flex.pos": Number.NaN }) }), "invalid_observation"],
    ["a string joint", event({ observation: obs({ "elbow_flex.pos": "35" }) }), "invalid_observation"],
    ["an arm joint beyond 180 degrees", event({ observation: obs({ "shoulder_pan.pos": 181 }) }), "invalid_observation"],
    ["a gripper beyond 100 percent", event({ observation: obs({ "gripper.pos": 101 }) }), "invalid_observation"],
    ["a negative gripper", event({ observation: obs({ "gripper.pos": -1 }) }), "invalid_observation"],
  ])("drops %s before any database or Twin access", async (_l, value, reason) => {
    const { bridge, db, twin } = build();
    await expect(bridge.handle(value)).resolves.toBe(`dropped:${reason}`);
    expect(db.$queryRaw).not.toHaveBeenCalled(); expect(twin.publishPhysical).not.toHaveBeenCalled();
  });
  it.each([
    ["no physical commissioning configured", (() => { throw new Error("x"); }) as never, "commissioning_not_configured"],
    ["a closed commissioning window", policy({ untilMs: NOW - 1 }), "commissioning_window_closed"],
  ])("refuses when there is %s (invalid commissioning session)", async (_l, pol, reason) => {
    const { bridge, db, twin } = build([row()], "accepted", pol as never);
    await expect(bridge.handle(event())).resolves.toBe(`dropped:${reason}`);
    expect(db.$queryRaw).not.toHaveBeenCalled(); expect(twin.publishPhysical).not.toHaveBeenCalled();
  });
  it.each([
    ["an unknown command", [], "unknown_command"],
    ["a command of another robot (wrong robot)", [row({ robot_id: "99999999-9999-4999-8999-999999999999" })], "robot_mismatch"],
    ["a learner outside the allowlist (unauthorized / cross-tenant user)", [row({ learner_user_id: "99999999-9999-4999-8999-999999999999" })], "user_not_authorized"],
    ["a queued command", [row({ state: "queued" })], "command_not_active"],
    ["a completed command", [row({ state: "completed" })], "command_not_active"],
    ["a simulation run falsely sending physical telemetry (fake_follower)", [row({ runtime_mode: "fake_follower" })], "not_physical_provenance"],
    ["a schematic run", [row({ execution_mode: "schematic", runtime_mode: null })], "not_physical_provenance"],
    ["an unverified runtime that stated no mode", [row({ runtime_mode: null })], "not_physical_provenance"],
    ["an undeclared adapter", [row({ runtime_mode: "something_else" })], "not_physical_provenance"],
    ["a message adapter that differs from the persisted run", [row({ runtime_mode: "so101_follower" })], "adapter_mismatch"],
  ])("drops telemetry for %s and never reaches the Twin", async (_l, rows, reason) => {
    const { bridge, twin } = build(rows as never);
    const value = reason === "adapter_mismatch" ? event({ adapterMode: "other_adapter" }) : event();
    const policyModes = reason === "adapter_mismatch" ? policy({ runtimeModes: new Set(["so101_follower", "other_adapter"]) }) : policy();
    const b = reason === "adapter_mismatch" ? build(rows as never, "accepted", policyModes as never).bridge : bridge;
    await expect(b.handle(value)).resolves.toBe(`dropped:${reason}`);
    expect(twin.publishPhysical).not.toHaveBeenCalled();
  });
  it("a device declaring a physical adapter is not enough: the persisted provenance and the declared modes decide", async () => {
    const { bridge, twin } = build([row({ runtime_mode: "so101_follower" })], "accepted", policy({ runtimeModes: new Set(["another_declared_mode"]) }) as never);
    await expect(bridge.handle(event())).resolves.toBe("dropped:not_physical_provenance"); expect(twin.publishPhysical).not.toHaveBeenCalled();
  });
  it("drops duplicates and out-of-order frames per command", async () => {
    const { bridge, twin } = build();
    expect(await bridge.handle(event({ sequence: 10 }))).toBe("forwarded");
    expect(await bridge.handle(event({ sequence: 10 }))).toBe("dropped:duplicate_or_out_of_order");
    expect(await bridge.handle(event({ sequence: 9 }))).toBe("dropped:duplicate_or_out_of_order");
    expect(await bridge.handle(event({ sequence: 11 }))).toBe("forwarded"); expect(twin.publishPhysical).toHaveBeenCalledTimes(2);
  });
  it("rate limits per robot (backpressure)", async () => {
    const { bridge } = build(); const out: string[] = [];
    for (let i = 0; i < 7; i += 1) out.push(await bridge.handle(event({ sequence: 100 + i })));
    expect(out.filter((r) => r === "forwarded")).toHaveLength(5); expect(out.filter((r) => r === "dropped:rate_limited")).toHaveLength(2);
  });
  it.each(["unavailable", "rejected"])("isolates a Twin %s outcome as a dropped frame", async (status) => {
    await expect(build([row()], status).bridge.handle(event())).resolves.toBe(`dropped:twin_${status}`);
  });
  it("never throws and is inert when disabled or without a Twin owner id", async () => {
    const db = { $queryRaw: jest.fn().mockRejectedValue(new Error("db")) };
    await expect(new IotPhysicalTelemetryBridge(db as never, { publishPhysical: jest.fn() } as never, policy() as never, "o", () => NOW, {}).handle(event())).resolves.toBe("dropped:internal_error");
    await expect(new IotPhysicalTelemetryBridge({ $queryRaw: jest.fn() } as never, null, null, "", () => NOW).handle(event())).resolves.toBe("dropped:bridge_disabled");
    await expect(build([row()], "accepted", policy() as never, "").bridge.handle(event())).resolves.toBe("dropped:bridge_disabled");
  });
  it("only reads the database (command lifecycle independence)", async () => {
    const { bridge, db } = build(); await bridge.handle(event());
    const sql = JSON.stringify((db.$queryRaw.mock.calls[0][0] as { strings: string[] }).strings); expect(sql).toMatch(/SELECT/); expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/i);
  });
  it("physical and simulation stay distinct: the simulation bridge refuses the physical message and the physical bridge refuses the simulation one", async () => {
    const simTwin = { publish: jest.fn() }; const sim = new IotTelemetryBridge({ $queryRaw: jest.fn().mockResolvedValue([]) } as never, simTwin as never, () => NOW);
    expect(await sim.handle(event())).toMatch(/^dropped:/); expect(simTwin.publish).not.toHaveBeenCalled();
    const { bridge, twin } = build();
    expect(await bridge.handle({ ...event(), status: "telemetry", telemetry: { source_mode: "SIMULATION" } })).toMatch(/^dropped:/); expect(twin.publishPhysical).not.toHaveBeenCalled();
  });
});
