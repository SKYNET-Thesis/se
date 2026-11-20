import { ExperimentEvidenceStorage } from "./experiment-evidence.storage";

describe("ExperimentEvidenceStorage", () => {
  const scope = { organizationId: "11111111-1111-4111-8111-111111111111", classroomId: "22222222-2222-4222-8222-222222222222", experimentId: "33333333-3333-4333-8333-333333333333", studentId: "44444444-4444-4444-8444-444444444444" };

  it("builds only scoped experiment keys and rejects forged or traversal references", () => {
    const storage = new ExperimentEvidenceStorage({} as never);
    const key = storage.newKey(scope);
    expect(storage.validKey(key)).toBe(true);
    expect(storage.validKey("learning-media/experiments/../../other.json")).toBe(false);
    expect(storage.validKey("local://artifact")).toBe(false);
  });

  it("verifies object digest, size, and all tenant identity metadata", async () => {
    const key = "learning-media/experiments/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.json";
    const identity = { experimentId: scope.experimentId, studentId: scope.studentId, classroomId: scope.classroomId, organizationId: scope.organizationId };
    const client = { send: jest.fn().mockResolvedValue({ ContentLength: 12, Metadata: { "vista-sha256": "abc", "vista-experiment-id": scope.experimentId, "vista-student-id": scope.studentId, "vista-classroom-id": scope.classroomId, "vista-organization-id": scope.organizationId } }) };
    const storage = new ExperimentEvidenceStorage({ s3Context: () => ({ bucket: "local-test", client }) } as never);
    await expect(storage.verify(key, { ...identity, sha256: "abc", sizeBytes: 12 })).resolves.toBe(true);
    await expect(storage.verify(key, { ...identity, studentId: "55555555-5555-4555-8555-555555555555", sha256: "abc", sizeBytes: 12 })).resolves.toBe(false);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it("treats a missing object as unavailable", async () => {
    const client = { send: jest.fn().mockRejectedValue({ $metadata: { httpStatusCode: 404 } }) };
    const storage = new ExperimentEvidenceStorage({ s3Context: () => ({ bucket: "local-test", client }) } as never);
    await expect(storage.verify("learning-media/experiments/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.json", { ...scope, sha256: "abc", sizeBytes: 12 })).resolves.toBe(false);
  });
});
