import { parseArgs, provision, type ProvisioningStore } from "./provision-robot-entitlement";

const ORG = "11111111-1111-4111-8111-111111111111", ROBOT = "22222222-2222-4222-8222-222222222222";
const store = (over: Partial<ProvisioningStore> = {}): ProvisioningStore & Record<string, jest.Mock> => ({
  organization: jest.fn().mockResolvedValue({ id: ORG, name: "Test Org", status: "active" }),
  robotById: jest.fn().mockResolvedValue({ id: ROBOT, serial_no: "SER-1" }),
  robotBySerial: jest.fn().mockResolvedValue(null),
  entitlementExists: jest.fn().mockResolvedValue(false),
  allocationCount: jest.fn().mockResolvedValue(2),
  registerRobot: jest.fn().mockResolvedValue({ id: ROBOT, serial_no: "SER-NEW" }),
  createEntitlement: jest.fn().mockResolvedValue(undefined),
  ...over,
}) as never;

describe("provision-robot-entitlement", () => {
  it("is a dry run unless --confirm is given and reports the existing allocations it will not touch", async () => {
    const s = store();
    const { plan, applied } = await provision(s, parseArgs(["--organization", ORG, "--robot", ROBOT]));
    expect(applied).toBe(false);
    expect(plan).toMatchObject({ entitlement: "create", allocations: 2, robot: { id: ROBOT, willRegister: false } });
    expect(s.createEntitlement).not.toHaveBeenCalled(); expect(s.registerRobot).not.toHaveBeenCalled();
  });
  it("creates exactly one entitlement for the named organization with --confirm and never an allocation", async () => {
    const s = store();
    const { applied } = await provision(s, parseArgs(["--organization", ORG, "--robot", ROBOT, "--confirm"]));
    expect(applied).toBe(true);
    expect(s.createEntitlement).toHaveBeenCalledTimes(1); expect(s.createEntitlement).toHaveBeenCalledWith(ORG, ROBOT);
    expect(Object.keys(s)).not.toContain("allocate");
  });
  it("is idempotent when the entitlement already exists", async () => {
    const s = store({ entitlementExists: jest.fn().mockResolvedValue(true) });
    const { plan } = await provision(s, parseArgs(["--organization", ORG, "--robot", ROBOT, "--confirm"]));
    expect(plan.entitlement).toBe("exists"); expect(s.createEntitlement).not.toHaveBeenCalled();
  });
  it("registers a new robot resource only when asked and then entitles the organization", async () => {
    const s = store();
    const { plan } = await provision(s, parseArgs(["--organization", ORG, "--register-serial", "SER-NEW", "--name", "E2E robot", "--confirm"]));
    expect(s.registerRobot).toHaveBeenCalledWith("SER-NEW", "E2E robot"); expect(plan.robot.willRegister).toBe(true); expect(s.createEntitlement).toHaveBeenCalledWith(ORG, ROBOT);
  });
  it.each([
    ["an unknown organization", { organization: jest.fn().mockResolvedValue(null) }, /Organization was not found/],
    ["an inactive organization", { organization: jest.fn().mockResolvedValue({ id: ORG, name: "x", status: "closed" }) }, /not active/],
    ["an unknown robot id", { robotById: jest.fn().mockResolvedValue(null) }, /Robot was not found/],
  ])("refuses %s", async (_l, over, message) => {
    await expect(provision(store(over as never), parseArgs(["--organization", ORG, "--robot", ROBOT, "--confirm"]))).rejects.toThrow(message);
  });
  it.each([
    [["--organization", "x", "--robot", ROBOT]], [["--organization", ORG]], [["--organization", ORG, "--robot", ROBOT, "--register-serial", "SER-1", "--name", "n"]],
    [["--organization", ORG, "--register-serial", "S", "--name", "n"]], [["--organization", ORG, "--register-serial", "SER-1"]],
  ])("rejects invalid arguments %j", (argv) => expect(() => parseArgs(argv as string[])).toThrow());
});
