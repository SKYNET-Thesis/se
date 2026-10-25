import { PhysicalExecutionController } from "./physical-execution.controller";

describe("PhysicalExecutionController", () => {
  const user = { vistaUserId: "student-1" } as never;
  const service = { eligibility: jest.fn(), prepare: jest.fn(), start: jest.fn(), status: jest.fn(), stop: jest.fn(), active: jest.fn() };
  const controller = new PhysicalExecutionController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it("resolves eligibility from authenticated Student and Attempt only", async () => {
    service.eligibility.mockResolvedValue({ eligible: true });
    await expect(controller.eligibility(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toEqual({ eligible: true });
    expect(service.eligibility).toHaveBeenCalledWith(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("prepares ownership without accepting browser execution authority", async () => {
    service.prepare.mockResolvedValue({ id: "physical-1", status: "pending" });
    await expect(controller.prepare(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toMatchObject({ id: "physical-1" });
    expect(service.prepare).toHaveBeenCalledWith(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("starts, reads, stops and restores using authenticated identity only", async () => {
    service.start.mockResolvedValue({ id: "physical-1", status: "queued" });
    service.status.mockResolvedValue({ id: "physical-1", status: "running" });
    service.stop.mockResolvedValue({ id: "physical-1", status: "cancelled" });
    service.active.mockResolvedValue({ id: "physical-1", status: "running" });
    await controller.start(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await controller.status(user, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await controller.stop(user, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await controller.active(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(service.start).toHaveBeenCalledWith(user, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(service.status).toHaveBeenCalledWith(user, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(service.stop).toHaveBeenCalledWith(user, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
  });
});
