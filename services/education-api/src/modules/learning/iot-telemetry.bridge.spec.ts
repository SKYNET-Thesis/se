import { IotTelemetryBridge, isTelemetryEvent, SO101_JOINTS } from "./iot-telemetry.bridge";

const ROBOT = "f1c066c4-b5f2-45c4-b933-f034f3824dd9", CMD = "11111111-1111-4111-8111-111111111111", EXP = "22222222-2222-4222-8222-222222222222", ORG = "33333333-3333-4333-8333-333333333333";
const NOW = 1_800_000_000_000;
const joints = (over: Record<string, unknown>[] = []) => SO101_JOINTS.map((name, i) => ({ name, position: 0.1 * i, unit: name === "gripper" ? "percent" : "rad", ...(over[i] ?? {}) }));
const frame = (over: Record<string, unknown> = {}) => ({ schema_version: 1, robot_id: ROBOT, source_mode: "SIMULATION", controller_id: "edge-fake", measured_at: new Date(NOW - 200).toISOString(), sequence: 1, connection: "connected", measured: joints(), ...over });
const event = (over: Record<string, unknown> = {}, f: Record<string, unknown> = {}) => ({ schemaVersion: 1, kind: "status", status: "telemetry", robotId: ROBOT, commandId: CMD, eventId: `${CMD}:telemetry:${over.sequence ?? 10}`, sequence: 10, occurredAtMs: NOW - 100, telemetry: frame(f), ...over });
const row = (over: Record<string, unknown> = {}) => ({ command_id: CMD, robot_id: ROBOT, state: "executing", experiment_id: EXP, organization_id: ORG, attempt_id: "44444444-4444-4444-8444-444444444444", runtime_mode: "fake_follower", execution_mode: "real_robot", ...over });
const build = (rows: unknown[] = [row()], twinStatus = "accepted") => {
  const db = { $queryRaw: jest.fn().mockResolvedValue(rows) };
  const twin = { publish: jest.fn().mockResolvedValue({ status: twinStatus }) };
  const bridge = new IotTelemetryBridge(db as never, twin as never, () => NOW);
  return { bridge, db, twin };
};

describe("IotTelemetryBridge", () => {
  it("recognizes only status/telemetry messages", () => {
    expect(isTelemetryEvent(event())).toBe(true);
    expect(isTelemetryEvent({ kind: "status", status: "executing" })).toBe(false);
    expect(isTelemetryEvent({ kind: "ack", status: "telemetry" })).toBe(false);
    expect(isTelemetryEvent(null)).toBe(false);
  });

  it("forwards a valid simulation frame with the correlated organization, experiment and attempt", async () => {
    const { bridge, twin } = build();
    await expect(bridge.handle(event())).resolves.toBe("forwarded");
    expect(twin.publish).toHaveBeenCalledWith({ organizationId: ORG, robotId: ROBOT, experimentId: EXP, attemptId: "44444444-4444-4444-8444-444444444444", telemetry: expect.objectContaining({ source_mode: "SIMULATION", robot_id: ROBOT }) });
  });

  it.each([
    ["a wrong frame robot", event({}, { robot_id: "99999999-9999-4999-8999-999999999999" }), "frame_robot_mismatch"],
    ["a physical source mode (never relayed, never relabelled)", event({}, { source_mode: "LIVE_PHYSICAL", calibration_status: "VERIFIED" }), "source_mode_not_simulation"],
    ["a REPLAY source mode", event({}, { source_mode: "REPLAY" }), "source_mode_not_simulation"],
    ["a disconnected frame", event({}, { connection: "disconnected" }), "frame_not_connected"],
    ["five joints", event({}, { measured: joints().slice(0, 5) }), "invalid_joints"],
    ["joints in the wrong order", event({}, { measured: [...joints().slice(1), joints()[0]] }), "invalid_joints"],
    ["a NaN position", event({}, { measured: joints([{ position: Number.NaN }]) }), "invalid_joints"],
    ["an arm joint in percent", event({}, { measured: joints([{ unit: "percent" }]) }), "invalid_joints"],
    ["an unknown unit", event({}, { measured: joints([{ unit: "mm" }]) }), "invalid_joints"],
    ["a stale event", event({ occurredAtMs: NOW - 60_000 }), "stale"],
    ["a future event", event({ occurredAtMs: NOW + 60_000 }), "future"],
    ["a stale measurement", event({}, { measured_at: new Date(NOW - 60_000).toISOString() }), "frame_stale"],
    ["a malformed envelope", event({ eventId: undefined }), "malformed"],
    ["a missing frame", { ...event(), telemetry: undefined }, "frame_missing"],
  ])("drops %s without touching the database or the Twin", async (_label, value, reason) => {
    const { bridge, db, twin } = build();
    await expect(bridge.handle(value)).resolves.toBe(`dropped:${reason}`);
    expect(db.$queryRaw).not.toHaveBeenCalled(); expect(twin.publish).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown command", [], "unknown_command"],
    ["a different robot (wrong robot rejection)", [row({ robot_id: "99999999-9999-4999-8999-999999999999" })], "robot_mismatch"],
    ["a command that is not active (queued)", [row({ state: "queued" })], "command_not_active"],
    ["a completed command", [row({ state: "completed" })], "command_not_active"],
    ["a physical runtime (provenance)", [row({ runtime_mode: "so101_follower" })], "not_simulation_runtime"],
    ["an unverified runtime that stated no mode", [row({ runtime_mode: null })], "not_simulation_runtime"],
    ["a schematic execution", [row({ execution_mode: "schematic", runtime_mode: null })], "not_simulation_runtime"],
  ])("drops telemetry for %s and never reaches the Twin", async (_label, rows, reason) => {
    const { bridge, twin } = build(rows as never);
    await expect(bridge.handle(event())).resolves.toBe(`dropped:${reason}`);
    expect(twin.publish).not.toHaveBeenCalled();
  });

  it("treats a wrong experiment correlation as the lifecycle's experiment, never the frame's claim", async () => {
    const { bridge, twin } = build([row({ experiment_id: "55555555-5555-4555-8555-555555555555" })]);
    await bridge.handle(event({ experimentId: EXP }));
    expect(twin.publish).toHaveBeenCalledWith(expect.objectContaining({ experimentId: "55555555-5555-4555-8555-555555555555" }));
  });

  it("drops duplicates and out-of-order frames per command", async () => {
    const { bridge, twin } = build();
    expect(await bridge.handle(event({ sequence: 10 }))).toBe("forwarded");
    expect(await bridge.handle(event({ sequence: 10 }))).toBe("dropped:duplicate_or_out_of_order");
    expect(await bridge.handle(event({ sequence: 9 }))).toBe("dropped:duplicate_or_out_of_order");
    expect(await bridge.handle(event({ sequence: 11 }))).toBe("forwarded");
    expect(twin.publish).toHaveBeenCalledTimes(2);
  });

  it("rate limits per robot (backpressure) and recovers after a second", async () => {
    let now = NOW;
    const db = { $queryRaw: jest.fn().mockResolvedValue([row()]) }; const twin = { publish: jest.fn().mockResolvedValue({ status: "accepted" }) };
    const bridge = new IotTelemetryBridge(db as never, twin as never, () => now);
    const results: string[] = [];
    for (let i = 0; i < 7; i += 1) results.push(await bridge.handle(event({ sequence: 100 + i, occurredAtMs: now - 50 }, { measured_at: new Date(now - 50).toISOString() })));
    expect(results.filter((r) => r === "forwarded")).toHaveLength(5); expect(results.filter((r) => r === "dropped:rate_limited")).toHaveLength(2);
    now += 1500;
    expect(await bridge.handle(event({ sequence: 200, occurredAtMs: now - 50 }, { measured_at: new Date(now - 50).toISOString() }))).toBe("forwarded");
  });

  it.each(["unavailable", "rejected"])("isolates a Twin %s outcome: a dropped frame, never an error", async (status) => {
    const { bridge } = build([row()], status);
    await expect(bridge.handle(event())).resolves.toBe(`dropped:twin_${status}`);
  });

  it("never throws, even if the database or the Twin throws", async () => {
    const db = { $queryRaw: jest.fn().mockRejectedValue(new Error("db down")) };
    await expect(new IotTelemetryBridge(db as never, { publish: jest.fn() } as never, () => NOW).handle(event())).resolves.toBe("dropped:internal_error");
    const twin = { publish: jest.fn().mockRejectedValue(new Error("twin down")) };
    await expect(new IotTelemetryBridge({ $queryRaw: jest.fn().mockResolvedValue([row()]) } as never, twin as never, () => NOW).handle(event())).resolves.toBe("dropped:internal_error");
  });

  it("is a no-op when no Twin publisher is configured", async () => {
    await expect(new IotTelemetryBridge({ $queryRaw: jest.fn() } as never, null, () => NOW).handle(event())).resolves.toBe("dropped:bridge_disabled");
  });

  it("only reads: no statement writes to the lifecycle or experiment tables (command lifecycle independence)", async () => {
    const { bridge, db } = build();
    await bridge.handle(event());
    const sql = JSON.stringify((db.$queryRaw.mock.calls[0][0] as { strings: string[] }).strings);
    expect(sql).toMatch(/SELECT/); expect(sql).not.toMatch(/UPDATE|INSERT|DELETE/i);
  });
});
