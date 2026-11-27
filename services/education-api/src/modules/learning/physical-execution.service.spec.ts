process.env.VISTA_PHYSICAL_RUNTIME_MODES = "declared_physical_adapter"; // this suite simulates a deployment whose runtime reports a declared physical adapter
import { ConflictException, NotFoundException } from "@nestjs/common";
import { PhysicalExecutionService } from "./physical-execution.service";

const user = {
  authUserId: "auth-1",
  vistaUserId: "11111111-1111-4111-8111-111111111111",
  email: "student@vista.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: [],
  memberships: [{
    id: "22222222-2222-4222-8222-222222222222",
    organizationId: "33333333-3333-4333-8333-333333333333",
    roleCode: "student",
    status: "active",
    permissions: ["learning.work.write", "learning.experiment.execute"],
  }],
} as const;

const scope = (overrides: Record<string, unknown> = {}) => ({
  attempt_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  classroom_assignment_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  assignment_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  classroom_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  organization_id: "33333333-3333-4333-8333-333333333333",
  membership_id: "22222222-2222-4222-8222-222222222222",
  program_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  submission_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  program_version_id: "12121212-1212-4121-8121-121212121212",
  robot_program: { kind: "robot_program", schemaVersion: 1, steps: [{ type: "wait", durationMs: 100 }] },
  symbolic_evaluation_id: "13131313-1313-4131-8131-131313131313",
  symbolic_verdict: "passed",
  robot_id: "14141414-1414-4141-8141-141414141414",
  robot_name: "VISTA classroom robot",
  robot_model: "SO-101",
  robot_serial: "VISTA-DEMO-01",
  entitlement_id: "15151515-1515-4151-8151-151515151515",
  lab_session_id: "18181818-1818-4181-8181-181818181818",
  reserved_by_other: false,
  safety_profile_id: "16161616-1616-4161-8161-161616161616",
  safety_profile_snapshot: { maxSpeedPct: 10, allowedModes: ["blockly"] },
  mode_id: "17171717-1717-4171-8171-171717171717",
  challenge_id: "challenge-l4-pick-place",
  ...overrides,
});

describe("PhysicalExecutionService Gate 1", () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = jest.fn();
  const runtime = { createRun: jest.fn(), getRun: jest.fn(), cancelRun: jest.fn(), status: jest.fn() };
  const progression = {
    resolveQualifiedL4ProgramVersion: jest.fn(),
    completeLesson: jest.fn(),
    coursePath: jest.fn(),
  };
  let service: PhysicalExecutionService;

  beforeEach(() => {
    queryRaw.mockReset();
    executeRaw.mockReset();
    transaction.mockReset();
    Object.values(runtime).forEach((mock) => mock.mockReset());
    Object.values(progression).forEach((mock) => mock.mockReset());
    runtime.status.mockResolvedValue({
      stopped: false,
      checkik: {
        reachable: true,
        snapshot: {
          mode: "fake_follower",
          backend: { motionEnabled: true, latchedMotionLock: false },
          readiness: { ready: true },
        },
      },
    });
    progression.resolveQualifiedL4ProgramVersion.mockResolvedValue({
      verdict: "passed",
      qualifiedProgramVersionId: scope().program_version_id,
      programVersionId: scope().program_version_id,
      programId: scope().program_id,
      submissionId: scope().submission_id,
      versionNumber: 2,
      challengeId: scope().challenge_id,
      symbolicEvaluationId: scope().symbolic_evaluation_id,
      evaluationId: scope().symbolic_evaluation_id,
      schematicExperimentId: "exp-l4",
      experimentId: "exp-l4",
      attemptId: scope().attempt_id,
      passedAt: new Date(),
      qualifiedAt: new Date(),
      robotProgram: scope().robot_program,
    });
    progression.completeLesson.mockResolvedValue({ completedLessonId: "l5-id", newlyUnlockedLessonIds: [] });
    progression.coursePath.mockResolvedValue({ progressPercent: 100 });
    transaction.mockImplementation(async (work) => work({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
    service = new PhysicalExecutionService(
      { $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: transaction } as never,
      runtime as never,
      progression as never,
    );
  });

  it("returns sanitized eligibility for the exact submitted ProgramVersion and matching PASS", async () => {
    queryRaw.mockResolvedValueOnce([scope()]);
    await expect(service.eligibility(user as never, scope().attempt_id as string)).resolves.toMatchObject({
      eligible: true,
      classroom: { id: scope().classroom_id, assignmentId: scope().assignment_id },
      robot: { id: scope().robot_id, name: scope().robot_name, model: scope().robot_model, serial: scope().robot_serial },
      programVersion: { id: scope().program_version_id },
      symbolicEvaluation: { id: scope().symbolic_evaluation_id, verdict: "passed" },
      readiness: expect.objectContaining({ allocated: true, entitled: true, symbolicPassed: true }),
    });
  });

  it("does not reveal a forged or another student's Attempt", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.eligibility(user as never, "99999999-9999-4999-8999-999999999999")).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [{ submission_id: null }, "PHYSICAL_EXECUTION_NOT_ELIGIBLE"],
    [{ program_version_id: null }, "PHYSICAL_EXECUTION_NOT_ELIGIBLE"],
    [{ symbolic_evaluation_id: null }, "SYMBOLIC_PASS_REQUIRED"],
    [{ symbolic_verdict: "failed" }, "SYMBOLIC_PASS_REQUIRED"],
    [{ robot_id: null }, "ROBOT_NOT_ALLOCATED"],
    [{ entitlement_id: null }, "ROBOT_ENTITLEMENT_INVALID"],
    [{ lab_session_id: null }, "LAB_SESSION_NOT_ACTIVE"],
    [{ lab_session_id: null, reserved_by_other: true }, "ROBOT_RESERVED_BY_ANOTHER_CLASSROOM"],
  ])("fails closed for incomplete authoritative provenance %p", async (overrides, code) => {
    queryRaw.mockResolvedValueOnce([scope(overrides)]);
    await expect(service.eligibility(user as never, scope().attempt_id as string)).resolves.toMatchObject({ eligible: false, code });
  });

  it("keeps mutable Program edits irrelevant by using only the submitted ProgramVersion", async () => {
    queryRaw.mockResolvedValueOnce([scope({ robot_program: { kind: "robot_program", schemaVersion: 1, steps: [{ type: "gripper.open" }] } })]);
    const result = await service.eligibility(user as never, scope().attempt_id as string);
    expect(result).toMatchObject({ eligible: true, programVersion: { id: scope().program_version_id } });
    expect(JSON.stringify(result)).not.toContain("robot_program");
  });

  it("resolves an exact persisted PASS instead of letting a later failed evaluation mask it", async () => {
    queryRaw.mockResolvedValueOnce([scope()]);
    await service.eligibility(user as never, scope().attempt_id as string);
    const sql = Array.from(queryRaw.mock.calls[0][0] as readonly string[]).join(" ");
    expect(sql).toContain("evidence.verdict='passed'");
  });

  it("creates Control Session, a new physical Experiment and initial event under the Robot advisory lock", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }]);

    const result = await service.prepare(user as never, scope().attempt_id as string);

    expect(result).toMatchObject({
      id: "19191919-1919-4191-8191-191919191919",
      status: "pending",
      executionMode: "real_robot",
      controlSession: { id: "18181818-1818-4181-8181-181818181818", state: "created" },
    });
    expect(executeRaw).toHaveBeenCalledTimes(3);
    const insertSql = Array.from(queryRaw.mock.calls[4][0] as readonly string[]).join(" ");
    expect(insertSql).toContain("'blockly','real_robot','pending'");
    expect(queryRaw.mock.invocationCallOrder[2]).toBeLessThan(queryRaw.mock.invocationCallOrder[3]);
  });

  it("returns the authoritative existing execution for an equivalent active request", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([{ control_session_id: "18181818-1818-4181-8181-181818181818", state: "created", experiment_id: "19191919-1919-4191-8191-191919191919", experiment_status: "pending", learner_user_id: user.vistaUserId, attempt_id: scope().attempt_id, submission_id: scope().submission_id, program_version_id: scope().program_version_id }]);
    await expect(service.prepare(user as never, scope().attempt_id as string)).resolves.toMatchObject({ id: "19191919-1919-4191-8191-191919191919", idempotent: true });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects another Student or Classroom when the allocated Robot is busy", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([{ control_session_id: "busy", state: "created", experiment_id: "other", experiment_status: "pending", learner_user_id: "other-student", attempt_id: "other-attempt", submission_id: "other-submission", program_version_id: "other-version" }]);
    await expect(service.prepare(user as never, scope().attempt_id as string)).rejects.toMatchObject({ response: expect.objectContaining({ code: "ROBOT_BUSY" }) });
  });

  it("fails closed when allocation changes after locking the originally resolved Robot", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope({ robot_id: "20202020-2020-4202-8202-202020202020" })]);
    await expect(service.prepare(user as never, scope().attempt_id as string)).rejects.toMatchObject({ response: expect.objectContaining({ code: "PHYSICAL_EXECUTION_NOT_ELIGIBLE" }) });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("allows acquisition after a terminal old session", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }]);
    await expect(service.prepare(user as never, scope().attempt_id as string)).resolves.toMatchObject({ executionMode: "real_robot" });
  });

  it("rolls back session ownership when physical Experiment persistence fails", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockRejectedValueOnce(new Error("experiment write failed"));
    await expect(service.prepare(user as never, scope().attempt_id as string)).rejects.toThrow("experiment write failed");
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects inactive users before querying and never calls a runtime", async () => {
    await expect(service.prepare({ ...user, status: "disabled" } as never, scope().attempt_id as string)).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
    expect(JSON.stringify(service)).not.toContain("RuntimeService");
  });

  it("starts the prepared execution with the exact server-loaded ProgramVersion and a server-owned run ID", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
      .mockResolvedValueOnce([scope()]);
    runtime.createRun.mockResolvedValue({ runId: "wf03-19191919-1919-4191-8191-191919191919", state: "queued" });
    await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).resolves.toMatchObject({ id: "19191919-1919-4191-8191-191919191919", status: "queued" });
    expect(runtime.createRun).toHaveBeenCalledWith(scope().robot_id, {
      runId: "wf03-19191919-1919-4191-8191-191919191919",
      robotId: scope().robot_id,
      programVersionId: scope().program_version_id,
      profile: "lesson",
      program: scope().robot_program,
    });
  });

  it("refuses an enabled IoT dispatch before sending anything outside the local fake runtime", async () => {
    const iot = { enabled: jest.fn().mockReturnValue(true), simulationStartEnabled: jest.fn().mockReturnValue(false), physicalStartEnabled: jest.fn().mockReturnValue(false) }; // default: the simulation start mode is not selected
    const guarded = new PhysicalExecutionService(
      { $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: transaction } as never,
      runtime as never,
      progression as never,
      iot as never,
    );
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
      .mockResolvedValueOnce([scope()]);
    await expect(guarded.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({ response: { code: "LOCAL_FAKE_RUNTIME_REQUIRED" } });
    expect(runtime.createRun).not.toHaveBeenCalled();
    expect(iot.enabled).toHaveBeenCalled();
  });

  describe("simulation-only IoT start mode (Device Shadow preflight)", () => {
    const freshShadow = (over: Record<string, unknown> = {}) => ({ connection: "connected", runtimeKind: "MOCK_RUNTIME", hardwareEnabled: false, stopped: false, reportedAtMs: Date.now(), ...over });
    const build = (shadow: unknown, createRunCommand = jest.fn()) => {
      const iot = { enabled: jest.fn().mockReturnValue(true), simulationStartEnabled: jest.fn().mockReturnValue(true), physicalStartEnabled: jest.fn().mockReturnValue(false), readShadow: jest.fn().mockResolvedValue(shadow), shadowMaxAgeMs: jest.fn().mockReturnValue(30000), createRunCommand };
      const svc = new PhysicalExecutionService(
        { $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: transaction } as never, runtime as never, progression as never, iot as never);
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
        .mockResolvedValueOnce([scope()]);
      return { svc, iot };
    };
    const start = (svc: PhysicalExecutionService) => svc.start(user as never, scope().attempt_id as string, { safetyConfirmed: true });

    it.each([
      ["a Thing that never reported", null, "ROBOT_RUNTIME_UNAVAILABLE"],
      ["a disconnected edge", freshShadow({ connection: "disconnected" }), "ROBOT_RUNTIME_UNAVAILABLE"],
      ["a stale shadow", freshShadow({ reportedAtMs: Date.now() - 120000 }), "ROBOT_RUNTIME_UNAVAILABLE"],
      ["a stopped runtime", freshShadow({ stopped: true }), "ROBOT_RUNTIME_STOPPED"],
      ["a runtime with the hardware driver enabled", freshShadow({ hardwareEnabled: true }), "LOCAL_FAKE_RUNTIME_REQUIRED"],
      ["an unverified runtime kind", freshShadow({ runtimeKind: "UNVERIFIED_RUNTIME" }), "LOCAL_FAKE_RUNTIME_REQUIRED"],
      ["a runtime that claims to be physical", freshShadow({ runtimeKind: "PHYSICAL_ROBOT", hardwareEnabled: true }), "LOCAL_FAKE_RUNTIME_REQUIRED"],
    ])("refuses %s and never dispatches", async (_label, shadow, code) => {
      const { svc, iot } = build(shadow);
      await expect(start(svc)).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
      expect(iot.createRunCommand).not.toHaveBeenCalled();
      expect(runtime.createRun).not.toHaveBeenCalled();
      expect(runtime.status).not.toHaveBeenCalled();
    });

    it("treats a Device Shadow read failure as the runtime being unavailable", async () => {
      const { svc, iot } = build(null);
      iot.readShadow.mockRejectedValueOnce(new Error("network"));
      await expect(start(svc)).rejects.toMatchObject({ response: expect.objectContaining({ code: "ROBOT_RUNTIME_UNAVAILABLE" }) });
      expect(iot.createRunCommand).not.toHaveBeenCalled();
    });

    it("accepts a fresh connected MOCK_RUNTIME with hardware disabled: reaches the IoT dispatch without consulting the loopback runtime", async () => {
      const sentinel = new Error("reached IoT dispatch");
      const { svc, iot } = build(freshShadow(), jest.fn(() => { throw sentinel; }));
      await expect(start(svc)).rejects.toBe(sentinel);
      expect(iot.readShadow).toHaveBeenCalledWith(scope().robot_id);
      expect(iot.createRunCommand).toHaveBeenCalledTimes(1);
      expect(runtime.status).not.toHaveBeenCalled();
      expect(runtime.createRun).not.toHaveBeenCalled();
    });
  });

  describe("supervised physical commissioning start mode", () => {
    const READY = { connection: "connected", runtimeKind: "UNVERIFIED_RUNTIME", adapterMode: "so101_follower", hardwareEnabled: true, armed: true, calibrationReady: true, fault: null, stopped: false };
    const shadow = (over: Record<string, unknown> = {}) => ({ ...READY, reportedAtMs: Date.now(), ...over });
    const policy = (over: Record<string, unknown> = {}) => ({ robotId: String(scope().robot_id).toLowerCase(), userIds: new Set([String((user as { vistaUserId: string }).vistaUserId).toLowerCase()]), untilMs: Date.now() + 3_600_000, runtimeModes: new Set(["so101_follower"]), ...over });
    const build = (sh: unknown, pol: unknown = policy(), createRunCommand = jest.fn()) => {
      const iot = { enabled: jest.fn().mockReturnValue(true), simulationStartEnabled: jest.fn().mockReturnValue(false), physicalStartEnabled: jest.fn().mockReturnValue(true),
        physicalCommissioningPolicy: jest.fn(() => { if (pol instanceof Error) throw pol; return pol; }), readShadow: jest.fn().mockResolvedValue(sh), shadowMaxAgeMs: jest.fn().mockReturnValue(30000), createRunCommand };
      const svc = new PhysicalExecutionService({ $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: transaction } as never, runtime as never, progression as never, iot as never);
      queryRaw.mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
        .mockResolvedValueOnce([scope()]);
      return { svc, iot };
    };
    const start = (svc: PhysicalExecutionService) => svc.start(user as never, scope().attempt_id as string, { safetyConfirmed: true });

    it.each([
      ["not configured", shadow(), new Error("x"), "PHYSICAL_COMMISSIONING_NOT_CONFIGURED"],
      ["a closed window", shadow(), policy({ untilMs: Date.now() - 1 }), "PHYSICAL_COMMISSIONING_CLOSED"],
      ["an unapproved robot", shadow(), policy({ robotId: "99999999-9999-4999-8999-999999999999" }), "PHYSICAL_COMMISSIONING_ROBOT_NOT_APPROVED"],
      ["a user outside the allowlist", shadow(), policy({ userIds: new Set(["99999999-9999-4999-8999-999999999999"]) }), "PHYSICAL_COMMISSIONING_USER_NOT_AUTHORIZED"],
      ["a disarmed runtime", shadow({ armed: false }), policy(), "ROBOT_NOT_READY"],
      ["an armed flag that is missing", shadow({ armed: undefined }), policy(), "ROBOT_NOT_READY"],
      ["an uncalibrated runtime", shadow({ calibrationReady: false }), policy(), "ROBOT_NOT_READY"],
      ["a runtime with a fault", shadow({ fault: "servo_overload" }), policy(), "ROBOT_NOT_READY"],
      ["hardware disabled", shadow({ hardwareEnabled: false }), policy(), "ROBOT_NOT_READY"],
      ["a stopped runtime", shadow({ stopped: true }), policy(), "ROBOT_RUNTIME_STOPPED"],
      ["a stale shadow", shadow({ reportedAtMs: Date.now() - 120000 }), policy(), "ROBOT_RUNTIME_UNAVAILABLE"],
      ["a mock adapter", shadow({ adapterMode: "fake_follower" }), policy({ runtimeModes: new Set(["fake_follower"]) }), "PHYSICAL_RUNTIME_NOT_DECLARED"],
      ["a MOCK_RUNTIME kind", shadow({ runtimeKind: "MOCK_RUNTIME" }), policy(), "PHYSICAL_RUNTIME_NOT_DECLARED"],
      ["an undeclared adapter mode", shadow({ adapterMode: "something_else" }), policy(), "PHYSICAL_RUNTIME_NOT_DECLARED"],
    ])("refuses %s and never dispatches", async (_label, sh, pol, code) => {
      const { svc, iot } = build(sh, pol as never);
      await expect(start(svc)).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
      expect(iot.createRunCommand).not.toHaveBeenCalled(); expect(runtime.createRun).not.toHaveBeenCalled(); expect(runtime.status).not.toHaveBeenCalled();
    });

    it("dispatches only when the approved robot, user, window, fresh armed calibrated declared-physical shadow and safety confirmation all hold", async () => {
      const sentinel = new Error("reached IoT dispatch");
      const { svc, iot } = build(shadow(), policy(), jest.fn(() => { throw sentinel; }));
      await expect(start(svc)).rejects.toBe(sentinel);
      expect(iot.createRunCommand).toHaveBeenCalledTimes(1); expect(runtime.createRun).not.toHaveBeenCalled();
    });

    it("still requires the student's explicit safety confirmation", async () => {
      const { svc, iot } = build(shadow());
      await expect(svc.start(user as never, scope().attempt_id as string, {} as never)).rejects.toMatchObject({ response: expect.objectContaining({ code: "SAFETY_CONFIRMATION_REQUIRED" }) });
      expect(iot.readShadow).not.toHaveBeenCalled();
    });
  });

  it("refuses to dispatch unless the configured runtime declares fake_follower mode", async () => {
    queryRaw
      .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
      .mockResolvedValueOnce([scope()]);
    runtime.status.mockResolvedValueOnce({ stopped: false, checkik: { reachable: true, snapshot: { mode: "physical", backend: { motionEnabled: true, latchedMotionLock: false }, readiness: { ready: true } } } });
    await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({ response: expect.objectContaining({ code: "LOCAL_FAKE_RUNTIME_REQUIRED" }) });
    expect(runtime.createRun).not.toHaveBeenCalled();
  });

  it("does not publish IoT commands when startup preflight rejects after preparation", async () => {
    const publish = jest.fn();
    const iot = { enabled: jest.fn().mockReturnValue(false), publish };
    const guarded = new PhysicalExecutionService(
      { $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: transaction } as never,
      runtime as never,
      progression as never,
      iot as never,
    );
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
      .mockResolvedValueOnce([scope()]);
    runtime.status.mockResolvedValueOnce({ stopped: false, checkik: { reachable: true, snapshot: { mode: "physical", backend: { motionEnabled: true, latchedMotionLock: false }, readiness: { ready: true } } } });

    await expect(guarded.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
      response: expect.objectContaining({ code: "LOCAL_FAKE_RUNTIME_REQUIRED" }),
    });
    expect(publish).not.toHaveBeenCalled();
    expect(runtime.createRun).not.toHaveBeenCalled();
    expect(queryRaw).toHaveBeenCalledTimes(6);
    expect(executeRaw).toHaveBeenCalledTimes(6);
  });

  it("reconciles runtime terminal success before returning it and completes C1-L5", async () => {
    queryRaw
      .mockResolvedValueOnce([{
        experiment_id: "19191919-1919-4191-8191-191919191919", control_session_id: "18181818-1818-4181-8181-181818181818",
        robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
        program_version_id: scope().program_version_id, status: "running", run_id: "wf03-19191919-1919-4191-8191-191919191919",
      }])
      .mockResolvedValueOnce([{
        learner_user_id: user.vistaUserId, execution_mode: "real_robot", runtime_mode: "declared_physical_adapter",
        program_version_id: scope().program_version_id, course_id: "course-1", l5_lesson_id: "l5-id",
      }])
      .mockResolvedValueOnce([{ id: "eval-pass" }]);
    runtime.getRun.mockResolvedValue({ state: "succeeded", startedAtMs: 1000, endedAtMs: 2000, events: [{ type: "gripper.close" }] });
    await expect(service.status(user as never, "19191919-1919-4191-8191-191919191919")).resolves.toMatchObject({ status: "succeeded" });
    expect(executeRaw).toHaveBeenCalled();
    expect(executeRaw.mock.calls.flat(2)).toContain("completed");
    expect(progression.completeLesson).toHaveBeenCalledWith(expect.anything(), user.vistaUserId, "l5-id");
  });

  it("maps the R1 running state to the database-supported active ControlSession state", async () => {
    queryRaw.mockResolvedValueOnce([{
      experiment_id: "19191919-1919-4191-8191-191919191919", control_session_id: "18181818-1818-4181-8181-181818181818",
      robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
      program_version_id: scope().program_version_id, status: "pending", run_id: "wf03-19191919-1919-4191-8191-191919191919",
    }]);
    runtime.getRun.mockResolvedValue({ state: "running", startedAtMs: 1000 });
    await expect(service.status(user as never, "19191919-1919-4191-8191-191919191919")).resolves.toMatchObject({ status: "running" });
    expect(executeRaw.mock.calls.flat(2)).toContain("active");
    const eventSql = Array.from(executeRaw.mock.calls[2][0] as readonly string[]).join(" ");
    expect(eventSql).toContain("ON CONFLICT (experiment_id,event_index) DO NOTHING");
  });

  it("stops only an owned execution through R1", async () => {
    queryRaw.mockResolvedValueOnce([{
      experiment_id: "19191919-1919-4191-8191-191919191919", control_session_id: "18181818-1818-4181-8181-181818181818",
      robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
      program_version_id: scope().program_version_id, status: "running", run_id: "wf03-19191919-1919-4191-8191-191919191919",
    }]);
    runtime.cancelRun.mockResolvedValue({ state: "cancelled", endedAtMs: 2000 });
    await expect(service.stop(user as never, "19191919-1919-4191-8191-191919191919")).resolves.toMatchObject({ status: "cancelled" });
    expect(runtime.cancelRun).toHaveBeenCalledWith(scope().robot_id, "wf03-19191919-1919-4191-8191-191919191919");
  });

  it("recovers a server-owned R1 run after its first DB metadata write failed", async () => {
    queryRaw.mockResolvedValueOnce([{
      experiment_id: "19191919-1919-4191-8191-191919191919", control_session_id: "18181818-1818-4181-8181-181818181818",
      robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
      program_version_id: scope().program_version_id, status: "pending", run_id: null, runtime_started: false,
    }]);
    runtime.getRun.mockResolvedValue({ runId: "wf03-19191919-1919-4191-8191-191919191919", state: "running", startedAtMs: 1000 });
    await expect(service.status(user as never, "19191919-1919-4191-8191-191919191919")).resolves.toMatchObject({ status: "running" });
    expect(runtime.getRun).toHaveBeenCalledWith(scope().robot_id, "wf03-19191919-1919-4191-8191-191919191919");
  });

  const mockPreparedExecution = () => {
    queryRaw
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([scope()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "18181818-1818-4181-8181-181818181818", state: "created", created_at: new Date() }])
      .mockResolvedValueOnce([{ id: "19191919-1919-4191-8191-191919191919", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
      .mockResolvedValueOnce([scope()]);
  };

  describe("P0.9 Security Tests A-K", () => {
    it("A. unauthenticated execution rejected", async () => {
      await expect(service.start({ ...user, status: "disabled" } as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("B. another learner cannot execute someone else's ProgramVersion", async () => {
      queryRaw.mockResolvedValueOnce([]);
      await expect(service.start(user as never, "other-student-attempt", { safetyConfirmed: true })).rejects.toBeInstanceOf(NotFoundException);
    });

    it("C. unqualified ProgramVersion rejected", async () => {
      progression.resolveQualifiedL4ProgramVersion.mockResolvedValueOnce(null);
      mockPreparedExecution();
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "PROGRAM_VERSION_NOT_QUALIFIED" }),
      });
    });

    it("D. failed symbolic evaluation rejected", async () => {
      queryRaw.mockResolvedValueOnce([scope({ symbolic_verdict: "failed" })]);
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SYMBOLIC_PASS_REQUIRED" }),
      });
    });

    it("E. no entitlement rejected", async () => {
      queryRaw.mockResolvedValueOnce([scope({ entitlement_id: null })]);
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROBOT_ENTITLEMENT_INVALID" }),
      });
    });

    it("F. no classroom allocation rejected", async () => {
      queryRaw.mockResolvedValueOnce([scope({ robot_id: null })]);
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROBOT_NOT_ALLOCATED" }),
      });
    });

    it("G. conflicting ControlSession rejected", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()])
        .mockResolvedValueOnce([{ control_session_id: "busy", state: "active", experiment_id: "other", experiment_status: "running", learner_user_id: "other-user" }]);
      await expect(service.prepare(user as never, scope().attempt_id as string)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROBOT_BUSY" }),
      });
    });

    it("H. runtime offline or not-ready rejected", async () => {
      mockPreparedExecution();
      runtime.status.mockRejectedValueOnce(new Error("offline"));
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROBOT_RUNTIME_UNAVAILABLE" }),
      });

      mockPreparedExecution();
      runtime.status.mockResolvedValueOnce({ stopped: false, checkik: { reachable: true, snapshot: { backend: { motionEnabled: true, latchedMotionLock: false }, readiness: { ready: false } } } });
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROBOT_NOT_READY" }),
      });
    });

    it("I. unsafe/E-stop state rejected where Runtime exposes it", async () => {
      mockPreparedExecution();
      runtime.status.mockResolvedValueOnce({ stopped: false, checkik: { reachable: true, snapshot: { backend: { motionEnabled: true, latchedMotionLock: true }, readiness: { ready: true } } } });
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ESTOP_ACTIVE" }),
      });

      mockPreparedExecution();
      runtime.status.mockResolvedValueOnce({ stopped: true });
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "ROBOT_RUNTIME_STOPPED" }),
      });
    });

    it("J. missing explicit safety confirmation rejected", async () => {
      await expect(service.start(user as never, scope().attempt_id as string, { safetyConfirmed: false })).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SAFETY_CONFIRMATION_REQUIRED" }),
      });
      await expect(service.start(user as never, scope().attempt_id as string)).rejects.toMatchObject({
        response: expect.objectContaining({ code: "SAFETY_CONFIRMATION_REQUIRED" }),
      });
    });

    it("K. arbitrary frontend programVersionId cannot bypass backend qualification", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "sess-1", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "exp-1", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
        .mockResolvedValueOnce([scope()]);
      runtime.createRun.mockResolvedValue({ runId: "wf03-exp-1", state: "queued" });
      await service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true, forgedId: "forged-version" } as never);
      expect(runtime.createRun).toHaveBeenCalledWith(scope().robot_id, expect.objectContaining({
        programVersionId: scope().program_version_id,
      }));
      expect(runtime.createRun).not.toHaveBeenCalledWith(scope().robot_id, expect.objectContaining({
        programVersionId: "forged-version",
      }));
    });
  });

  describe("P0.9 Execution Tests L-X", () => {
    it("L. qualified version + all gates pass -> Runtime dispatch occurs once", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "sess-1", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "exp-1", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
        .mockResolvedValueOnce([scope()]);
      runtime.createRun.mockResolvedValue({ runId: "wf03-exp-1", state: "queued" });
      await service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true });
      expect(runtime.createRun).toHaveBeenCalledTimes(1);
    });

    it("M. dispatch uses exact immutable qualified ProgramVersion", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "sess-1", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "exp-1", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
        .mockResolvedValueOnce([scope()]);
      runtime.createRun.mockResolvedValue({ runId: "wf03-exp-1", state: "queued" });
      await service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true });
      expect(runtime.createRun).toHaveBeenCalledWith(scope().robot_id, expect.objectContaining({
        programVersionId: scope().program_version_id,
        program: scope().robot_program,
      }));
    });

    it("N. physical Experiment is persisted with execution_mode = real_robot", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "sess-1", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "exp-1", status: "pending", execution_mode: "real_robot", created_at: new Date() }]);
      const res = await service.prepare(user as never, scope().attempt_id as string);
      expect(res.executionMode).toBe("real_robot");
      const insertSql = Array.from(queryRaw.mock.calls[4][0] as readonly string[]).join(" ");
      expect(insertSql).toContain("'real_robot'");
    });

    it("O. lifecycle events are persisted", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "sess-1", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "exp-1", status: "pending", execution_mode: "real_robot", created_at: new Date() }]);
      await service.prepare(user as never, scope().attempt_id as string);
      expect(executeRaw).toHaveBeenCalled();
      const insertEvent = executeRaw.mock.calls.some((call) =>
        Array.from(call[0] as readonly string[]).join(" ").includes("physical_execution_prepared"),
      );
      expect(insertEvent).toBe(true);
    });

    it("P. Runtime success -> Experiment succeeded", async () => {
      queryRaw
        .mockResolvedValueOnce([{
          experiment_id: "exp-1", control_session_id: "sess-1",
          robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
          program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
        }])
        .mockResolvedValueOnce([{
          learner_user_id: user.vistaUserId, execution_mode: "real_robot", runtime_mode: "declared_physical_adapter",
          program_version_id: scope().program_version_id, course_id: "course-1", l5_lesson_id: "l5-id",
        }])
        .mockResolvedValueOnce([{ id: "eval-pass" }]);
      runtime.getRun.mockResolvedValue({ state: "succeeded", startedAtMs: 1000, endedAtMs: 2000, events: [] });
      const res = await service.status(user as never, "exp-1");
      expect(res.status).toBe("succeeded");
    });

    const withRuntimeMode = (runtimeMode: string | null) => {
      queryRaw
        .mockResolvedValueOnce([{
          experiment_id: "exp-1", control_session_id: "sess-1",
          robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
          program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
        }])
        .mockResolvedValueOnce([{
          learner_user_id: user.vistaUserId, execution_mode: "real_robot", runtime_mode: runtimeMode,
          program_version_id: scope().program_version_id, course_id: "course-1", l5_lesson_id: "l5-id",
        }])
        .mockResolvedValueOnce([{ id: "eval-pass" }]);
      runtime.getRun.mockResolvedValue({ state: "succeeded", startedAtMs: 1000, endedAtMs: 2000, events: [] });
    };

    it("Q2. a successful run on a FAKE FOLLOWER runtime records its result but never completes the physical lesson", async () => {
      withRuntimeMode("fake_follower");
      const dto = await service.status(user as never, "exp-1");
      expect(dto.status).toBe("succeeded");
      expect(progression.completeLesson).not.toHaveBeenCalled();
    });

    it("Q3. a runtime that does not state what drove the robot does not complete the physical lesson", async () => {
      withRuntimeMode(null);
      await service.status(user as never, "exp-1");
      expect(progression.completeLesson).not.toHaveBeenCalled();
    });

    it("Q4. an undeclared adapter mode is unverified and does not complete the lesson; a declared one does", async () => {
      withRuntimeMode("some_other_adapter");
      await service.status(user as never, "exp-1");
      expect(progression.completeLesson).not.toHaveBeenCalled();
      queryRaw.mockReset();
      withRuntimeMode("declared_physical_adapter");
      await service.status(user as never, "exp-1");
      expect(progression.completeLesson).toHaveBeenCalledTimes(1);
    });

    it("Q. Runtime success -> C1-L5 completed", async () => {
      queryRaw
        .mockResolvedValueOnce([{
          experiment_id: "exp-1", control_session_id: "sess-1",
          robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
          program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
        }])
        .mockResolvedValueOnce([{
          learner_user_id: user.vistaUserId, execution_mode: "real_robot", runtime_mode: "declared_physical_adapter",
          program_version_id: scope().program_version_id, course_id: "course-1", l5_lesson_id: "l5-id",
        }])
        .mockResolvedValueOnce([{ id: "eval-pass" }]);
      runtime.getRun.mockResolvedValue({ state: "succeeded", startedAtMs: 1000, endedAtMs: 2000, events: [] });
      await service.status(user as never, "exp-1");
      expect(progression.completeLesson).toHaveBeenCalledWith(expect.anything(), user.vistaUserId, "l5-id");
    });

    it("R. Runtime success -> Course 1 reaches 100%", async () => {
      const projection = await progression.coursePath(user as never, "course-1");
      expect(projection.progressPercent).toBe(100);
    });

    it("S. Runtime failure -> L5 remains incomplete", async () => {
      queryRaw.mockResolvedValueOnce([{
        experiment_id: "exp-1", control_session_id: "sess-1",
        robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
        program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
      }]);
      runtime.getRun.mockResolvedValue({ state: "failed", errorCode: "runtime_execution_failed" });
      const res = await service.status(user as never, "exp-1");
      expect(res.status).toBe("failed");
      expect(progression.completeLesson).not.toHaveBeenCalled();
    });

    it("T. Runtime stopped/cancelled -> L5 remains incomplete", async () => {
      queryRaw.mockResolvedValueOnce([{
        experiment_id: "exp-1", control_session_id: "sess-1",
        robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
        program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
      }]);
      runtime.cancelRun.mockResolvedValue({ state: "cancelled", endedAtMs: 2000 });
      const res = await service.stop(user as never, "exp-1");
      expect(res.status).toBe("cancelled");
      expect(progression.completeLesson).not.toHaveBeenCalled();
    });

    it("U. timeout -> L5 remains incomplete", async () => {
      queryRaw.mockResolvedValueOnce([{
        experiment_id: "exp-1", control_session_id: "sess-1",
        robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
        program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
      }]);
      runtime.getRun.mockResolvedValue({ state: "failed", errorCode: "runtime_execution_timeout" });
      const res = await service.status(user as never, "exp-1");
      expect(res.status).toBe("failed");
      expect(progression.completeLesson).not.toHaveBeenCalled();
    });

    it("V. duplicate success finalization is idempotent", async () => {
      queryRaw
        .mockResolvedValueOnce([{
          experiment_id: "exp-1", control_session_id: "sess-1",
          robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
          program_version_id: scope().program_version_id, status: "succeeded", run_id: "wf03-exp-1",
        }])
        .mockResolvedValueOnce([{
          learner_user_id: user.vistaUserId, execution_mode: "real_robot", runtime_mode: "declared_physical_adapter",
          program_version_id: scope().program_version_id, course_id: "course-1", l5_lesson_id: "l5-id",
        }])
        .mockResolvedValueOnce([{ id: "eval-pass" }]);
      runtime.getRun.mockResolvedValue({ state: "succeeded", startedAtMs: 1000, endedAtMs: 2000, events: [] });
      await service.status(user as never, "exp-1");
      expect(progression.completeLesson).toHaveBeenCalledTimes(1);
    });

    it("W. refresh during running does not create another execution", async () => {
      queryRaw
        .mockResolvedValueOnce([{ id: "exp-running" }])
        .mockResolvedValueOnce([{
          experiment_id: "exp-running", control_session_id: "sess-1",
          robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
          program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-running", runtime_started: true,
        }]);
      runtime.getRun.mockResolvedValue({ state: "running", startedAtMs: 1000 });
      const res = await service.active(user as never, scope().attempt_id as string);
      expect(res).toMatchObject({ status: "running" });
      expect(runtime.createRun).not.toHaveBeenCalled();
    });

    it("X. retry after failure does not mutate the qualified ProgramVersion", async () => {
      queryRaw
        .mockResolvedValueOnce([scope()]).mockResolvedValueOnce([scope()]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "sess-retry", state: "created", created_at: new Date() }])
        .mockResolvedValueOnce([{ id: "exp-retry", status: "pending", execution_mode: "real_robot", created_at: new Date() }])
        .mockResolvedValueOnce([scope()]);
      runtime.createRun.mockResolvedValue({ runId: "wf03-exp-retry", state: "queued" });
      const res = await service.start(user as never, scope().attempt_id as string, { safetyConfirmed: true });
      expect(res.programVersion.id).toBe(scope().program_version_id);
      expect(runtime.createRun).toHaveBeenCalledWith(scope().robot_id, expect.objectContaining({
        programVersionId: scope().program_version_id,
      }));
    });
  });

  it("records runtime loss without falsely terminating the session or confirming stop", async () => {
    queryRaw.mockResolvedValueOnce([{
      experiment_id: "exp-1", control_session_id: "sess-1",
      robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
      program_version_id: scope().program_version_id, status: "running", run_id: "wf03-exp-1",
    }]);
    runtime.cancelRun.mockRejectedValue(new ConflictException({ code: "ROBOT_RUNTIME_UNAVAILABLE" }));
    await expect(service.stop(user as never, "exp-1")).rejects.toBeInstanceOf(ConflictException);
    expect(executeRaw).toHaveBeenCalledTimes(3);
    const persistedSql = executeRaw.mock.calls.map(([query]) => Array.isArray(query) ? query.join("?") : String(query)).join("\n");
    expect(persistedSql).toContain("runtime_unavailable");
    expect(JSON.stringify(executeRaw.mock.calls)).toContain("stopConfirmed");
    expect(JSON.stringify(executeRaw.mock.calls)).toContain("false");
    expect(persistedSql).toContain("ended_at IS NULL");
    expect(progression.completeLesson).not.toHaveBeenCalled();
  });
});
