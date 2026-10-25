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
  safety_profile_id: "16161616-1616-4161-8161-161616161616",
  safety_profile_snapshot: { maxSpeedPct: 10, allowedModes: ["blockly"] },
  mode_id: "17171717-1717-4171-8171-171717171717",
  ...overrides,
});

describe("PhysicalExecutionService Gate 1", () => {
  const queryRaw = jest.fn();
  const executeRaw = jest.fn();
  const transaction = jest.fn();
  const runtime = { createRun: jest.fn(), getRun: jest.fn(), cancelRun: jest.fn(), status: jest.fn() };
  let service: PhysicalExecutionService;

  beforeEach(() => {
    queryRaw.mockReset();
    executeRaw.mockReset();
    transaction.mockReset();
    Object.values(runtime).forEach((mock) => mock.mockReset());
    transaction.mockImplementation(async (work) => work({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
    service = new PhysicalExecutionService({ $queryRaw: queryRaw, $executeRaw: executeRaw, $transaction: transaction } as never, runtime as never);
  });

  it("returns sanitized eligibility for the exact submitted ProgramVersion and matching PASS", async () => {
    queryRaw.mockResolvedValueOnce([scope()]);
    await expect(service.eligibility(user as never, scope().attempt_id as string)).resolves.toEqual({
      eligible: true,
      classroom: { id: scope().classroom_id, assignmentId: scope().assignment_id },
      robot: { id: scope().robot_id, name: scope().robot_name, model: scope().robot_model, serial: scope().robot_serial },
      programVersion: { id: scope().program_version_id },
      symbolicEvaluation: { id: scope().symbolic_evaluation_id, verdict: "passed" },
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
    await expect(service.start(user as never, scope().attempt_id as string)).resolves.toMatchObject({ id: "19191919-1919-4191-8191-191919191919", status: "queued" });
    expect(runtime.createRun).toHaveBeenCalledWith(scope().robot_id, {
      runId: "wf03-19191919-1919-4191-8191-191919191919",
      programVersionId: scope().program_version_id,
      profile: "lesson",
      program: scope().robot_program,
    });
  });

  it("reconciles runtime terminal success before returning it", async () => {
    queryRaw.mockResolvedValueOnce([{
      experiment_id: "19191919-1919-4191-8191-191919191919", control_session_id: "18181818-1818-4181-8181-181818181818",
      robot_id: scope().robot_id, robot_name: scope().robot_name, robot_model: scope().robot_model, robot_serial: scope().robot_serial,
      program_version_id: scope().program_version_id, status: "running", run_id: "wf03-19191919-1919-4191-8191-191919191919",
    }]);
    runtime.getRun.mockResolvedValue({ state: "succeeded", startedAtMs: 1000, endedAtMs: 2000, events: [{ type: "gripper.close" }] });
    await expect(service.status(user as never, "19191919-1919-4191-8191-191919191919")).resolves.toMatchObject({ status: "succeeded" });
    expect(executeRaw).toHaveBeenCalled();
    expect(executeRaw.mock.calls.flat(2)).toContain("completed");
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
});
