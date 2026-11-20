import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { DigitalTwinScopeService } from "./digital-twin-scope.service";

const user = {
  authUserId: "auth-1",
  vistaUserId: "11111111-1111-4111-8111-111111111111",
  email: "student@vista.test",
  status: "active",
  systemRoleCodes: [],
  systemPermissions: [],
  memberships: [{ id: "m-1", organizationId: "33333333-3333-4333-8333-333333333333", roleCode: "student", status: "active", permissions: ["learning.experiment.execute"] }],
} as const;

describe("DigitalTwinScopeService", () => {
  const queryRaw = jest.fn();
  const config = { get: jest.fn((key: string) => key === "DIGITAL_TWIN_SCOPE_SECRET" ? "scope-secret" : undefined) };
  let service: DigitalTwinScopeService;

  beforeEach(() => {
    queryRaw.mockReset();
    config.get.mockClear();
    service = new DigitalTwinScopeService({ $queryRaw: queryRaw } as never, config as never);
  });

  it("issues a short-lived viewer scope bound to the server-resolved organization and requested allocated robot", async () => {
    queryRaw.mockResolvedValueOnce([{ organization_id: "33333333-3333-4333-8333-333333333333", robot_id: "44444444-4444-4444-8444-444444444444" }]);
    const issued = await service.issueViewerScope(user as never, "44444444-4444-4444-8444-444444444444");
    const [, encoded] = issued.token.split(".");
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    expect(issued.robotId).toBe("44444444-4444-4444-8444-444444444444");
    expect(issued.organizationId).toBe("33333333-3333-4333-8333-333333333333");
    expect(claims).toMatchObject({ kind: "viewer", sub: user.vistaUserId, org: issued.organizationId, robots: [issued.robotId], aud: "vista-digital-twin-viewer" });
    expect(typeof claims.jti).toBe("string");
    expect(issued.expiresAt).toBeTruthy();
  });

  it("denies a robot that is not allocated to the authenticated member, including cross-organization ids", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.issueViewerScope(user as never, "44444444-4444-4444-8444-444444444444")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("requires telemetry capability before querying allocation", async () => {
    const noCapability = { ...user, memberships: [{ ...user.memberships[0], permissions: [] }] };
    await expect(service.issueViewerScope(noCapability as never, "44444444-4444-4444-8444-444444444444")).rejects.toBeInstanceOf(ForbiddenException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("lists entitled SO-101 robots in the member's organization and preserves the database access decision", async () => {
    queryRaw.mockResolvedValueOnce([
      { id: "44444444-4444-4444-8444-444444444444", name: "SO-101 Follower A", model_name: "SO-101", status: "available", allocation_status: "allocated", viewer_access: true },
      { id: "55555555-5555-4555-8555-555555555555", name: "SO-101 Follower B", model_name: "SO-101", status: "offline", allocation_status: "not_allocated", viewer_access: false },
    ]);

    await expect(service.availableRobots(user as never)).resolves.toEqual([
      { id: "44444444-4444-4444-8444-444444444444", name: "SO-101 Follower A", modelName: "SO-101", status: "available", allocationStatus: "allocated", viewerAccess: "authorized" },
      { id: "55555555-5555-4555-8555-555555555555", name: "SO-101 Follower B", modelName: "SO-101", status: "offline", allocationStatus: "not_allocated", viewerAccess: "unavailable" },
    ]);
  });

  it("does not disclose cross-organization robots when the database returns no entitled rows", async () => {
    queryRaw.mockResolvedValueOnce([]);
    await expect(service.availableRobots(user as never)).resolves.toEqual([]);
  });

  describe("attempt-bound viewer scope", () => {
    const attemptId = "55555555-5555-4555-8555-555555555555";
    const robotId = "44444444-4444-4444-8444-444444444444";
    const row = { organization_id: "33333333-3333-4333-8333-333333333333", classroom_id: "66666666-6666-4666-8666-666666666666", assignment_id: "77777777-7777-4777-8777-777777777777", robot_id: robotId };

    it("binds the token to attempt, assignment, classroom, school and robot, with a 60 s expiry and a unique jti", async () => {
      queryRaw.mockResolvedValue([row]);
      const first = await service.issueAttemptViewerScope(user as never, attemptId, robotId, "lab-session-1");
      const second = await service.issueAttemptViewerScope(user as never, attemptId, robotId);
      const claims = JSON.parse(Buffer.from(first.token.split(".")[1], "base64url").toString("utf8"));
      expect(claims).toMatchObject({ kind: "viewer", aud: "vista-digital-twin-viewer", sub: user.vistaUserId, org: row.organization_id, robots: [robotId],
        attempt_id: attemptId, assignment_id: row.assignment_id, classroom_id: row.classroom_id, lab_session_id: "lab-session-1" });
      expect(claims.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(60);
      expect(JSON.parse(Buffer.from(second.token.split(".")[1], "base64url").toString("utf8")).jti).not.toBe(claims.jti);
      // one authorization path: the SQL itself requires attempt ownership, in-progress status, allocation to the same classroom and a live entitlement
      const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
      for (const fragment of ["at.learner_user_id=", "at.status='in_progress'", "allocation.classroom_id=c.id", "entitlement.valid_from<=now()", "o.status='active'", "close_at"]) expect(sql).toContain(fragment);
      expect(queryRaw.mock.calls[0].slice(1)).toEqual([robotId, attemptId, user.vistaUserId]);
    });

    it("answers 404 for another student's, another school's, closed, unallocated or unentitled attempts and never signs a token", async () => {
      queryRaw.mockResolvedValue([]);
      await expect(service.issueAttemptViewerScope(user as never, attemptId, robotId)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.issueAttemptViewerScope({ ...user, status: "disabled" } as never, attemptId, robotId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("fails closed when the broker secret is missing", async () => {
      queryRaw.mockResolvedValue([row]);
      config.get.mockReturnValueOnce(undefined);
      await expect(service.issueAttemptViewerScope(user as never, attemptId, robotId)).rejects.toThrow(/not configured/);
    });
  });
});
