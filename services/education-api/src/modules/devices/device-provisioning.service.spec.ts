import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { DeviceProvisioningService } from "./device-provisioning.service";

describe("DeviceProvisioningService with the feature flag off", () => {
  const original = process.env.DEVICE_PROVISIONING_ENABLED;
  const prisma = { $queryRaw: jest.fn(), $executeRaw: jest.fn(), $queryRawUnsafe: jest.fn(), $transaction: jest.fn() };
  const service = new DeviceProvisioningService(prisma as never);
  const user = { vistaUserId: "u", isSystemAdmin: true, memberships: [] } as never;
  beforeEach(() => { delete process.env.DEVICE_PROVISIONING_ENABLED; jest.clearAllMocks(); });
  afterAll(() => { if (original === undefined) delete process.env.DEVICE_PROVISIONING_ENABLED; else process.env.DEVICE_PROVISIONING_ENABLED = original; });

  it("answers 404 on every management and device route and never touches the database", async () => {
    const id = "00000000-0000-4000-8000-000000000001";
    await expect(service.register(user, id, { name: "x", deviceKind: "edge_runtime" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.list(user, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.get(user, id, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.suspend(user, id, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resume(user, id, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.revoke(user, id, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.rotate(user, id, id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.enrollStart("vd_" + "a".repeat(32))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.enrollComplete({ deviceId: id, nonce: "n", publicKey: "k".repeat(44), signature: "s".repeat(86) })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.authChallenge({ deviceId: id })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.authToken({ deviceId: id, nonce: "n", signature: "s".repeat(86) })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect(prisma.$executeRaw).not.toHaveBeenCalled(); expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("refuses every device token without consulting the database", async () => {
    await expect(service.authenticate("vd1.a.b")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
