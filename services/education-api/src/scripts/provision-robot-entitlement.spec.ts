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
  activeEntitlementsOfOthers: jest.fn().mockResolvedValue([{ id: "33333333-3333-4333-8333-333333333333", organization_id: "44444444-4444-4444-8444-444444444444" }]),
  setEntitlementEnd: jest.fn().mockResolvedValue(undefined),
  studentMembership: jest.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555", safety_profile_id: null }),
  blocklyProfileId: jest.fn().mockResolvedValue("66666666-6666-4666-8666-666666666666"),
  setMembershipProfile: jest.fn().mockResolvedValue(undefined),
  entitlementById: jest.fn().mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333", organization_id: "44444444-4444-4444-8444-444444444444", valid_to: new Date() }),
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
  describe("commissioning isolation", () => {
    const OTHER = "33333333-3333-4333-8333-333333333333";
    it("lists the other organizations' active entitlements in a dry run and changes nothing", async () => {
      const s = store();
      const { plan, applied } = await provision(s, parseArgs(["--organization", ORG, "--robot", ROBOT, "--isolate-others"]));
      expect(applied).toBe(false); expect(plan.isolate).toEqual([{ id: OTHER, organizationId: "44444444-4444-4444-8444-444444444444", validTo: null }]);
      expect(s.setEntitlementEnd).not.toHaveBeenCalled(); expect(s.createEntitlement).not.toHaveBeenCalled();
    });
    it("with --confirm ends only the other organizations' entitlements (never deletes, never touches the target organization)", async () => {
      const s = store();
      await provision(s, parseArgs(["--organization", ORG, "--robot", ROBOT, "--isolate-others", "--confirm"]));
      expect(s.activeEntitlementsOfOthers).toHaveBeenCalledWith(ROBOT, ORG);
      expect(s.setEntitlementEnd).toHaveBeenCalledTimes(1); expect(s.setEntitlementEnd).toHaveBeenCalledWith(OTHER, expect.any(Date));
      expect(Object.keys(s)).not.toContain("deleteEntitlement");
    });
    it("does not isolate anyone unless --isolate-others is given", async () => {
      const s = store(); await provision(s, parseArgs(["--organization", ORG, "--robot", ROBOT, "--confirm"]));
      expect(s.setEntitlementEnd).not.toHaveBeenCalled();
    });
    it("restores an entitlement by clearing valid_to (dry run first)", async () => {
      const s = store();
      expect((await provision(s, parseArgs(["--restore", OTHER]))).applied).toBe(false); expect(s.setEntitlementEnd).not.toHaveBeenCalled();
      expect((await provision(s, parseArgs(["--restore", OTHER, "--confirm"]))).applied).toBe(true); expect(s.setEntitlementEnd).toHaveBeenCalledWith(OTHER, null);
    });
    it("refuses to restore an unknown entitlement", async () => {
      await expect(provision(store({ entitlementById: jest.fn().mockResolvedValue(null) }), parseArgs(["--restore", OTHER, "--confirm"]))).rejects.toThrow(/not found/);
    });
  });
  describe("student Blockly authorization", () => {
    const STUDENT = "77777777-7777-4777-8777-777777777777";
    it("dry run shows the membership and previous profile and changes nothing", async () => {
      const s = store(); const { plan, applied } = await provision(s, parseArgs(["--organization", ORG, "--blockly-student", STUDENT]));
      expect(applied).toBe(false); expect(plan.blocklyStudent).toEqual({ userId: STUDENT, membershipId: "55555555-5555-4555-8555-555555555555", previousProfileId: null });
      expect(s.setMembershipProfile).not.toHaveBeenCalled();
    });
    it("sets the existing blockly profile on that one membership with --confirm and clears it again", async () => {
      const s = store();
      await provision(s, parseArgs(["--organization", ORG, "--blockly-student", STUDENT, "--confirm"]));
      expect(s.setMembershipProfile).toHaveBeenCalledWith("55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666");
      await provision(s, parseArgs(["--organization", ORG, "--clear-blockly-student", STUDENT, "--confirm"]));
      expect(s.setMembershipProfile).toHaveBeenLastCalledWith("55555555-5555-4555-8555-555555555555", null);
    });
    it("refuses a non-student, a missing profile and mixing with robot provisioning", async () => {
      await expect(provision(store({ studentMembership: jest.fn().mockResolvedValue(null) }), parseArgs(["--organization", ORG, "--blockly-student", STUDENT, "--confirm"]))).rejects.toThrow(/student member/);
      await expect(provision(store({ blocklyProfileId: jest.fn().mockResolvedValue(null) }), parseArgs(["--organization", ORG, "--blockly-student", STUDENT, "--confirm"]))).rejects.toThrow(/does not exist/);
      expect(() => parseArgs(["--organization", ORG, "--blockly-student", STUDENT, "--robot", ROBOT])).toThrow(/separate invocation/);
    });
  });
});
