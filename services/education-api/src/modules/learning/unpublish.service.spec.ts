import { ConflictException, NotFoundException } from "@nestjs/common";
import { UnpublishService } from "./unpublish.service";

const user = { authUserId: "a", vistaUserId: "u1", email: "i@x.test", status: "active", systemRoleCodes: [], systemPermissions: [], memberships: [] };

describe("UnpublishService", () => {
  const queryRaw = jest.fn(); const executeRaw = jest.fn();
  const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const scope = { canPublishOrganization: jest.fn(), assertTeacherClassroomAccess: jest.fn() };
  const service = new UnpublishService(prisma as never, scope as never);
  beforeEach(() => { queryRaw.mockReset(); executeRaw.mockReset().mockResolvedValue(1); scope.canPublishOrganization.mockReset().mockReturnValue(true); scope.assertTeacherClassroomAccess.mockReset().mockResolvedValue(undefined); });

  it("hides a course the caller may not publish and changes nothing", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "c", status: "published", organization_id: "o" }]); scope.canPublishOrganization.mockReturnValue(false);
    await expect(service.unpublishCourse(user as never, "c")).rejects.toBeInstanceOf(NotFoundException);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("only unpublishes a published course", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "c", status: "draft", organization_id: "o" }]);
    await expect(service.unpublishCourse(user as never, "c")).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([[{ offerings: 1, enrollments: 0 }], [{ offerings: 0, enrollments: 3 }]])("refuses to unpublish a delivered course %j (learner records stay intact)", async (counts) => {
    queryRaw.mockResolvedValueOnce([{ id: "c", status: "published", organization_id: "o" }]).mockResolvedValueOnce([counts]);
    await expect(service.unpublishCourse(user as never, "c")).rejects.toThrow(/Archive it instead/);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("returns an undelivered published course to draft", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "c", status: "published", organization_id: "o" }]).mockResolvedValueOnce([{ offerings: 0, enrollments: 0 }]);
    await expect(service.unpublishCourse(user as never, "c")).resolves.toEqual({ id: "c", status: "draft" });
  });

  it("requires classroom teaching access before touching an assignment", async () => {
    scope.assertTeacherClassroomAccess.mockRejectedValue(new NotFoundException("Classroom was not found."));
    await expect(service.unpublishAssignment(user as never, "cl", "as")).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("refuses to unpublish an assignment students already started", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "d", status: "published" }]).mockResolvedValueOnce([{ n: 2 }]);
    await expect(service.unpublishAssignment(user as never, "cl", "as")).rejects.toThrow(/Close it instead/);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("returns an assignment without attempts to draft", async () => {
    queryRaw.mockResolvedValueOnce([{ id: "d", status: "published" }]).mockResolvedValueOnce([{ n: 0 }]);
    await expect(service.unpublishAssignment(user as never, "cl", "as")).resolves.toEqual({ id: "d", status: "draft" });
  });
});
