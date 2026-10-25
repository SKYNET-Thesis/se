type BaseSafetyProfile = {
  max_speed_pct: number;
  workspace_limit: unknown;
  max_session_minutes: number | null;
  require_estop_ack: boolean;
};

type DemoPhysicalPolicyInput = {
  studentMembershipId: string;
  assignmentId: string;
  baseSafetyProfile: BaseSafetyProfile;
};

type DemoPhysicalPolicyClient = {
  control_modes: { upsert(args: unknown): Promise<{ id: string }> };
  safety_profiles: { upsert(args: unknown): Promise<{ id: string }> };
  memberships: { update(args: unknown): Promise<unknown> };
  learning_rubric_criteria: { upsert(args: unknown): Promise<{ id: string }> };
};

export async function provisionDemoPhysicalPolicy(
  tx: DemoPhysicalPolicyClient,
  input: DemoPhysicalPolicyInput,
) {
  const controlMode = await tx.control_modes.upsert({
    where: { code: "blockly" },
    update: { description: "Server-authorized execution of a persisted Blockly ProgramVersion" },
    create: { code: "blockly", description: "Server-authorized execution of a persisted Blockly ProgramVersion" },
    select: { id: true },
  });
  const safetyProfile = await tx.safety_profiles.upsert({
    where: { name: "student-blockly-demo" },
    update: {
      max_speed_pct: input.baseSafetyProfile.max_speed_pct,
      workspace_limit: input.baseSafetyProfile.workspace_limit,
      max_session_minutes: input.baseSafetyProfile.max_session_minutes,
      require_estop_ack: input.baseSafetyProfile.require_estop_ack,
      allowed_modes: ["blockly"],
    },
    create: {
      name: "student-blockly-demo",
      max_speed_pct: input.baseSafetyProfile.max_speed_pct,
      workspace_limit: input.baseSafetyProfile.workspace_limit,
      max_session_minutes: input.baseSafetyProfile.max_session_minutes,
      require_estop_ack: input.baseSafetyProfile.require_estop_ack,
      allowed_modes: ["blockly"],
    },
    select: { id: true },
  });
  await tx.memberships.update({
    where: { id: input.studentMembershipId },
    data: { safety_profile_id: safetyProfile.id },
  });
  const criterion = await tx.learning_rubric_criteria.upsert({
    where: { assignment_id_ordinal: { assignment_id: input.assignmentId, ordinal: 1 } },
    update: {
      title: "Robot sequence completed correctly",
      description: "The submitted sequence satisfies the persisted symbolic rules and can complete safely.",
      max_points: 10,
    },
    create: {
      assignment_id: input.assignmentId,
      ordinal: 1,
      title: "Robot sequence completed correctly",
      description: "The submitted sequence satisfies the persisted symbolic rules and can complete safely.",
      max_points: 10,
    },
    select: { id: true },
  });
  return { controlModeId: controlMode.id, safetyProfileId: safetyProfile.id, rubricCriterionId: criterion.id };
}
