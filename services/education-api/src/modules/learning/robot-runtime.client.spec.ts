import { ConflictException } from "@nestjs/common";
import { RobotRuntimeClient } from "./robot-runtime.client";
import { Test } from "@nestjs/testing";

describe("RobotRuntimeClient", () => {
  it("can be constructed by the Nest container without infrastructure providers", async () => {
    const module = await Test.createTestingModule({ providers: [RobotRuntimeClient] }).compile();
    expect(module.get(RobotRuntimeClient)).toBeInstanceOf(RobotRuntimeClient);
  });
  const mapping = JSON.stringify({
    "robot-1": { baseUrl: "http://127.0.0.1:8015", logicalIdentity: "vista-demo-fake" },
  });

  afterEach(() => jest.restoreAllMocks());

  it("uses only the server mapping and bearer token to create an R1 run", async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ runId: "wf03-exp-1", state: "queued" }) });
    const client = new RobotRuntimeClient({ VISTA_ROBOT_RUNTIME_MAP: mapping, VISTA_RUNTIME_TOKEN: "private-token" }, fetcher as never);
    await expect(client.createRun("robot-1", { runId: "wf03-exp-1", programVersionId: "pv-1", profile: "lesson", program: { kind: "robot_program", schemaVersion: 1, steps: [{ type: "wait", durationMs: 1 }] } })).resolves.toMatchObject({ state: "queued" });
    expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:8015/runs", expect.objectContaining({
      method: "POST", headers: expect.objectContaining({ Authorization: "Bearer private-token" }),
    }));
  });

  it("fails closed when the Robot has no configured runtime mapping", async () => {
    const client = new RobotRuntimeClient({ VISTA_ROBOT_RUNTIME_MAP: mapping, VISTA_RUNTIME_TOKEN: "private-token" }, jest.fn() as never);
    await expect(client.getRun("unknown", "run-1")).rejects.toMatchObject({ response: { code: "ROBOT_RUNTIME_NOT_CONFIGURED" } });
  });

  it("sanitizes unavailable runtime failures", async () => {
    const client = new RobotRuntimeClient({ VISTA_ROBOT_RUNTIME_MAP: mapping, VISTA_RUNTIME_TOKEN: "private-token" }, jest.fn().mockRejectedValue(new Error("connect ECONNREFUSED secret-host")) as never);
    await expect(client.getRun("robot-1", "run-1")).rejects.toBeInstanceOf(ConflictException);
    await expect(client.getRun("robot-1", "run-1")).rejects.not.toThrow("secret-host");
  });

  it("calls status and cancel through the mapped private runtime", async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ state: "cancelled" }) });
    const client = new RobotRuntimeClient({ VISTA_ROBOT_RUNTIME_MAP: mapping, VISTA_RUNTIME_TOKEN: "private-token" }, fetcher as never);
    await client.status("robot-1");
    await client.cancelRun("robot-1", "run-1");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["http://127.0.0.1:8015/status", "http://127.0.0.1:8015/runs/run-1/cancel"]);
  });

  it("distinguishes an R1 restart-lost run from runtime unavailability", async () => {
    const fetcher = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: "run_not_found" }) });
    const client = new RobotRuntimeClient({ VISTA_ROBOT_RUNTIME_MAP: mapping, VISTA_RUNTIME_TOKEN: "private-token" }, fetcher as never);
    await expect(client.getRun("robot-1", "lost-run")).rejects.toMatchObject({ response: { code: "ROBOT_RUNTIME_RUN_NOT_FOUND" } });
  });
});
