import { provisionDemoPhysicalPolicy } from "./demo-physical-policy";

describe("demo physical policy provisioning", () => {
  it("uses stable unique keys and preserves the conservative student safety limits", async () => {
    const controlModeUpsert = jest.fn().mockResolvedValue({ id: "mode-blockly" });
    const safetyProfileUpsert = jest.fn().mockResolvedValue({ id: "profile-blockly" });
    const membershipUpdate = jest.fn().mockResolvedValue({ id: "membership-student" });
    const rubricUpsert = jest.fn().mockResolvedValue({ id: "criterion-sequence" });
    const tx = {
      control_modes: { upsert: controlModeUpsert },
      safety_profiles: { upsert: safetyProfileUpsert },
      memberships: { update: membershipUpdate },
      learning_rubric_criteria: { upsert: rubricUpsert },
    };

    const result = await provisionDemoPhysicalPolicy(tx as never, {
      studentMembershipId: "membership-student",
      assignmentId: "assignment-gripper",
      baseSafetyProfile: {
        max_speed_pct: 20,
        workspace_limit: { x: [-0.2, 0.2] },
        max_session_minutes: 45,
        require_estop_ack: true,
      },
    });

    expect(controlModeUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: "blockly" } }));
    expect(safetyProfileUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { name: "student-blockly-demo" },
      create: expect.objectContaining({ max_speed_pct: 20, allowed_modes: ["blockly"], require_estop_ack: true }),
    }));
    expect(membershipUpdate).toHaveBeenCalledWith({ where: { id: "membership-student" }, data: { safety_profile_id: "profile-blockly" } });
    expect(rubricUpsert).toHaveBeenCalledWith(expect.objectContaining({ where: { assignment_id_ordinal: { assignment_id: "assignment-gripper", ordinal: 1 } } }));
    expect(result).toEqual({ controlModeId: "mode-blockly", safetyProfileId: "profile-blockly", rubricCriterionId: "criterion-sequence" });
  });
});
