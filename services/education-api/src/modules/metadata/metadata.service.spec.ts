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
});
