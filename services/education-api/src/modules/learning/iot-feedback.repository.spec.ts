import { FeedbackRepository } from "./iot-feedback.repository";

describe("FeedbackRepository", () => {
  const event = { eventId: "event-1", kind: "ack" as const, robotId: "robot-1", commandId: "command-1", sequence: 1, occurredAtMs: 1_000, status: "accepted" };

  it("records a ledger event and advances the locked lifecycle atomically", async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{ command_id: "command-1", robot_id: "robot-1", experiment_id: "experiment-1", control_session_id: "session-1", session_robot_id: "robot-1", experiment_control_session_id: "session-1", expires_at: new Date(2_000), state: "queued", last_sequence: BigInt(-1) }])
      .mockResolvedValueOnce([{ event_id: "event-1" }]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
    const repository = new FeedbackRepository({ $transaction: transaction } as never, () => 1_000);

    await expect(repository.process(event)).resolves.toBe("processed");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalled();
  });

  it("does not transition a duplicate redelivery", async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{ command_id: "command-1", robot_id: "robot-1", experiment_id: "experiment-1", control_session_id: "session-1", session_robot_id: "robot-1", experiment_control_session_id: "session-1", expires_at: new Date(2_000), state: "queued", last_sequence: BigInt(-1) }])
      .mockResolvedValueOnce([]);
    const executeRaw = jest.fn();
    const transaction = jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
    const repository = new FeedbackRepository({ $transaction: transaction } as never, () => 1_000);

    await expect(repository.process(event)).resolves.toBe("duplicate");
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("rejects a telemetry message as a lifecycle event before any database access (it can never fail or complete a command)", async () => {
    const transaction = jest.fn();
    const repository = new FeedbackRepository({ $transaction: transaction } as never, () => 1_000);
    for (const status of ["telemetry", "physical_telemetry"]) await expect(repository.process({ ...event, kind: "status", status })).rejects.toThrow(/not a command lifecycle event/);
    expect(transaction).not.toHaveBeenCalled();
  });

  describe("late acknowledgement (D-04): an ACK that arrives after the run already reports executing/completed", () => {
    const row = (state: string, lastSequence: number) => ({ command_id: "command-1", robot_id: "robot-1", experiment_id: "experiment-1", control_session_id: "session-1", session_robot_id: "robot-1", experiment_control_session_id: "session-1", expires_at: new Date(2_000_000), state, last_sequence: BigInt(lastSequence) });
    const harness = (state: string, lastSequence: number, priorAck: boolean) => {
      const queryRaw = jest.fn()
        .mockResolvedValueOnce([row(state, lastSequence)])
        .mockResolvedValueOnce([{ event_id: "event-1" }])
        .mockResolvedValueOnce(priorAck ? [{ event_id: "earlier-ack" }] : []);
      const executeRaw = jest.fn().mockResolvedValue(1);
      const transaction = jest.fn(async (work: (tx: unknown) => Promise<unknown>) => work({ $queryRaw: queryRaw, $executeRaw: executeRaw }));
      return { queryRaw, executeRaw, repository: new FeedbackRepository({ $transaction: transaction } as never, () => 1_000) };
    };
    const sql = (call: unknown[]) => JSON.stringify(call[0]);

    it.each(["executing", "completed", "failed"])("records the ACK once as iot_ack_acknowledged without changing the %s state", async (state) => {
      const { repository, executeRaw } = harness(state, 3, false);
      await expect(repository.process({ ...event, sequence: 2 })).resolves.toBe("processed");
      const statements = executeRaw.mock.calls.map(sql).join("\n");
      expect(statements).toContain("iot_ack_acknowledged");
      expect(statements).toContain("acknowledged_at");
      expect(statements).not.toContain("UPDATE public.learning_experiments");
      expect(statements).not.toContain("UPDATE public.control_sessions");
      expect(statements).not.toContain("last_sequence");
    });

    it("rejects a second acknowledgement for the same command as stale (exactly one ACK event)", async () => {
      const { repository, executeRaw } = harness("executing", 3, true);
      await expect(repository.process({ ...event, sequence: 2 })).rejects.toThrow(/sequence is stale/);
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it.each([["queued", 5], ["acknowledged", 5], ["timed_out", 5]])("still rejects a stale ACK while the lifecycle is %s", async (state, last) => {
      const { repository, executeRaw } = harness(state as string, last as number, false);
      await expect(repository.process({ ...event, sequence: 2 })).rejects.toThrow(/sequence is stale/);
      expect(executeRaw).not.toHaveBeenCalled();
    });

    it("still rejects a stale status event and a rejected ACK", async () => {
      for (const stale of [{ ...event, kind: "status" as const, status: "executing", sequence: 2 }, { ...event, status: "rejected", sequence: 2 }]) {
        const { repository, executeRaw } = harness("executing", 3, false);
        await expect(repository.process(stale)).rejects.toThrow(/sequence is stale/);
        expect(executeRaw).not.toHaveBeenCalled();
      }
    });

    it("rejects a late ACK whose occurredAt is more than 60 s in the future", async () => {
      const { repository, executeRaw } = harness("executing", 3, false);
      await expect(repository.process({ ...event, sequence: 2, occurredAtMs: 1_000 + 60_001 })).rejects.toThrow(/too far in the future/);
      expect(executeRaw).not.toHaveBeenCalled();
    });
  });
});
