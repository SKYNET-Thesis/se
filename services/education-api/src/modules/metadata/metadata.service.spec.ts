import { NotFoundException } from "@nestjs/common";
import { MetadataService } from "./metadata.service";

const student = {
  authUserId: "auth-1", vistaUserId: "user-1", email: "student@example.test", status: "active",
  systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id: "m-1", organizationId: "org-1", roleCode: "student", status: "active", permissions: ["learning.work.write", "learning.experiment.execute"] }],
};

describe("MetadataService safe provenance reads", () => {
  const queryRaw = jest.fn();
  const service = new MetadataService({ $queryRaw: queryRaw } as never);
  beforeEach(() => queryRaw.mockReset());

  it("does not disclose model metadata without the existing model.use capability", async () => {
    await expect(service.models(student, { page: 1, pageSize: 20 })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("keeps VLA interaction reads inside the learner's own experiment and requires execute capability", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.vlaInteractions(student, "other-experiment")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.vlaInteractions({ ...student, memberships: [{ ...student.memberships[0], status: "suspended", permissions: [] }] }, "own-experiment")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not create a training, evaluation, demonstration, or VLA provider request from metadata APIs", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.trainingRun(student, "not-owned")).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("never returns quiz answer keys from the challenge list", async () => {
    queryRaw.mockResolvedValueOnce([{
      id: "challenge-1", title: "Safety Knowledge Check", description: "Safety quiz",
      tabletop_config: {}, permitted_modes: ["schematic"], status: "published",
      created_at: new Date("2026-11-04T00:00:00Z"), updated_at: new Date("2026-11-04T00:00:00Z"),
      success_criteria: { kind: "knowledge_check", passPercent: 80, answerKey: { q1: "stop" } },
    }]);

    const result = await service.challenges(student, { page: 1, pageSize: 20 });

    expect(result.items).toEqual([expect.objectContaining({ id: "challenge-1", title: "Safety Knowledge Check" })]);
    expect(JSON.stringify(result)).not.toContain("answerKey");
    expect(JSON.stringify(result)).not.toContain("success_criteria");
  });

  it("never returns quiz answer keys from challenge detail", async () => {
    queryRaw.mockResolvedValueOnce([{
      id: "challenge-1", title: "Safety Knowledge Check", description: "Safety quiz",
      tabletop_config: {}, permitted_modes: ["schematic"], status: "published",
      created_at: new Date("2026-11-04T00:00:00Z"), updated_at: new Date("2026-11-04T00:00:00Z"),
      success_criteria: { kind: "knowledge_check", passPercent: 80, answerKey: { q1: "stop" } },
    }]);

    const result = await service.challenge(student, "challenge-1");

    expect(result).toEqual(expect.objectContaining({ id: "challenge-1", title: "Safety Knowledge Check" }));
    expect(JSON.stringify(result)).not.toContain("answerKey");
    expect(JSON.stringify(result)).not.toContain("success_criteria");
  });

  it("does not expose evaluator rules through learner challenge conditions", async () => {
    queryRaw
      .mockResolvedValueOnce([{ id: "challenge-1", title: "Reach Target A", status: "published" }])
      .mockResolvedValueOnce([{
        id: "condition-1", challenge_id: "challenge-1", condition_type: "symbolic",
        rule_key: "preview_target_match", rule_config: { position: { x: 240, y: 220, z: 120 } },
        description: "Reach the target", ordinal: 1, created_at: new Date("2026-11-04T00:00:00Z"),
      }]);

    const result = await service.challengeConditions(student, "challenge-1");

    expect(result).toEqual([expect.objectContaining({ id: "condition-1", description: "Reach the target" })]);
    expect(JSON.stringify(result)).not.toContain("rule_key");
    expect(JSON.stringify(result)).not.toContain("rule_config");
    expect(JSON.stringify(result)).not.toContain("preview_target_match");
  });
});
