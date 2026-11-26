import { IotFeedbackWorker } from "./iot-feedback-worker";

describe("IotFeedbackWorker", () => {
  it("deletes a message only after its repository transaction succeeds", async () => {
    const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: JSON.stringify({ eventId: "e", kind: "ack", robotId: "r", commandId: "c", sequence: 1, occurredAtMs: 1 }), ReceiptHandle: "receipt" }] }).mockResolvedValue(undefined);
    const worker = new IotFeedbackWorker("queue", { process: jest.fn().mockResolvedValue("processed") }, { send } as never);
    await worker.once();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("acknowledges malformed permanent messages without crashing the poller", async () => {
    const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: "not-json", ReceiptHandle: "receipt" }] }).mockResolvedValue(undefined);
    const worker = new IotFeedbackWorker("queue", { process: jest.fn() }, { send } as never);
    await worker.once();
    expect(send).toHaveBeenCalledTimes(2);
  });

  describe("telemetry frames", () => {
    const body = JSON.stringify({ schemaVersion: 1, kind: "status", status: "telemetry", eventId: "e", robotId: "r", commandId: "c", sequence: 5, occurredAtMs: 1, telemetry: {} });
    it("never reaches the lifecycle repository and is deleted (bridge disabled: dropped)", async () => {
      const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: body, ReceiptHandle: "receipt" }] }).mockResolvedValue(undefined);
      const repository = { process: jest.fn() };
      await new IotFeedbackWorker("queue", repository, { send } as never, { info: jest.fn(), warn: jest.fn() }).once();
      expect(repository.process).not.toHaveBeenCalled(); expect(send).toHaveBeenCalledTimes(2);
    });
    it("is relayed through the bridge, still never the repository, and a bridge failure cannot retain or fail the message", async () => {
      const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: body, ReceiptHandle: "r1" }, { Body: body, ReceiptHandle: "r2" }] }).mockResolvedValue(undefined);
      const repository = { process: jest.fn() };
      const telemetry = { handle: jest.fn().mockResolvedValueOnce("forwarded").mockRejectedValueOnce(new Error("twin")) };
      await new IotFeedbackWorker("queue", repository, { send } as never, { info: jest.fn(), warn: jest.fn() }, 5, 90, telemetry).once();
      expect(telemetry.handle).toHaveBeenCalledTimes(2); expect(repository.process).not.toHaveBeenCalled(); expect(send).toHaveBeenCalledTimes(3);
    });
    it("a lifecycle message right after telemetry is still processed normally", async () => {
      const ack = JSON.stringify({ eventId: "e2", kind: "ack", robotId: "r", commandId: "c", sequence: 6, occurredAtMs: 1 });
      const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: body, ReceiptHandle: "r1" }, { Body: ack, ReceiptHandle: "r2" }] }).mockResolvedValue(undefined);
      const repository = { process: jest.fn().mockResolvedValue("processed") };
      await new IotFeedbackWorker("queue", repository, { send } as never, { info: jest.fn(), warn: jest.fn() }, 5, 90, { handle: jest.fn().mockResolvedValue("forwarded") }).once();
      expect(repository.process).toHaveBeenCalledTimes(1);
    });
  });

  describe("physical telemetry frames", () => {
    const body = JSON.stringify({ schemaVersion: 1, kind: "status", status: "physical_telemetry", eventId: "e", robotId: "r", commandId: "c", sequence: 5, occurredAtMs: 1 });
    it("go only to the physical bridge, never to the simulation bridge or the lifecycle repository, and are deleted", async () => {
      const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: body, ReceiptHandle: "r" }] }).mockResolvedValue(undefined);
      const repository = { process: jest.fn() }; const sim = { handle: jest.fn() }; const phys = { handle: jest.fn().mockResolvedValue("forwarded") };
      await new IotFeedbackWorker("queue", repository, { send } as never, { info: jest.fn(), warn: jest.fn() }, 5, 90, sim, phys).once();
      expect(phys.handle).toHaveBeenCalledTimes(1); expect(sim.handle).not.toHaveBeenCalled(); expect(repository.process).not.toHaveBeenCalled(); expect(send).toHaveBeenCalledTimes(2);
    });
    it("are acknowledged and dropped when the physical bridge is disabled, and a bridge failure cannot retain the message", async () => {
      for (const phys of [null, { handle: jest.fn().mockRejectedValue(new Error("x")) }]) {
        const send = jest.fn().mockResolvedValueOnce({ Messages: [{ Body: body, ReceiptHandle: "r" }] }).mockResolvedValue(undefined);
        const repository = { process: jest.fn() };
        await new IotFeedbackWorker("queue", repository, { send } as never, { info: jest.fn(), warn: jest.fn() }, 5, 90, { handle: jest.fn() }, phys).once();
        expect(repository.process).not.toHaveBeenCalled(); expect(send).toHaveBeenCalledTimes(2);
      }
    });
  });
});
