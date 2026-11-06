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
});
