import { ForbiddenException } from "@nestjs/common";
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
});
