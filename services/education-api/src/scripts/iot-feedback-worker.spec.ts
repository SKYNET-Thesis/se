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
});
