import { NotFoundException } from "@nestjs/common";
import { LearningScopeService } from "./learning-scope.service";

const user = { authUserId:"auth-1", vistaUserId:"user-1", email:"student@vista.test", status:"active", systemRoleCodes:[], systemPermissions:[], memberships:[] };

describe("LearningScopeService", () => {
  const queryRaw = jest.fn();
  const service = new LearningScopeService({ $queryRaw: queryRaw } as never);
  beforeEach(() => queryRaw.mockReset());
  it("allows a student classroom backed by an active organization membership", async () => {
    queryRaw.mockResolvedValue([{ classroom_id: "class-a" }]);
    await expect(service.assertClassroomAccess(user, "class-a")).resolves.toBeUndefined();
  });
  it("denies another classroom without leaking it", async () => {
    queryRaw.mockResolvedValue([{ classroom_id: "class-a" }]);
    await expect(service.assertClassroomAccess(user, "class-b")).rejects.toBeInstanceOf(NotFoundException);
  });
  it("denies suspended or revoked memberships because active scope query returns no row", async () => {
    queryRaw.mockResolvedValue([]);
    await expect(service.assertClassroomAccess(user, "class-a")).rejects.toBeInstanceOf(NotFoundException);
  });
  it("allows the existing system-level org.manage authority", async () => {
    await expect(service.assertClassroomAccess({ ...user, systemPermissions:["org.manage"] }, "any-classroom")).resolves.toBeUndefined();
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it('allows an authorized school administrator to manage organization classrooms without a classroom membership row', async () => {
    queryRaw.mockResolvedValue([{ classroom_id: 'class-a' }]);
    await expect(service.assertTeacherClassroomAccess(user as never, 'class-a')).resolves.toBeUndefined();
    expect((queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('m.organization_id=c.organization_id');
    expect((queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?')).toContain('p.code=required.code');
  });

  it('reserves organization-wide classroom access for school administrators, not every holder of the delivery permission', async () => {
    queryRaw.mockResolvedValue([{ classroom_id: 'class-a' }]);
    await service.assertTeacherClassroomAccess(user as never, 'class-a');
    await service.canManageClassroom(user as never, 'class-a');
    await service.classroomIds(user as never);
    for (const call of queryRaw.mock.calls) {
      const sql = (call[0] as TemplateStringsArray).join('?');
      // the membership-only branch (no classroom_members relationship) must be limited to the school_admin role
      expect(sql).toContain("r.code='school_admin'");
      expect(sql).toContain('JOIN public.roles r ON r.id=m.role_id');
    }
    expect(queryRaw).toHaveBeenCalledTimes(3);
  });
  it("requires an active student classroom relationship before work may be created", async () => {
    const student = { ...user, memberships:[{ id:"member-1", organizationId:"org-1", roleCode:"student", status:"active", permissions:["learning.work.write"] }] };
    queryRaw.mockResolvedValue([{ classroom_id:"class-a" }]);
    await expect(service.assertStudentClassroomAccess(student, "class-a")).resolves.toBeUndefined();
  });
  it("does not let an active non-student classroom relationship start student work", async () => {
    const teacher = { ...user, memberships:[{ id:"member-1", organizationId:"org-1", roleCode:"instructor", status:"active", permissions:["learning.work.write"] }] };
    queryRaw.mockResolvedValue([]);
    await expect(service.assertStudentClassroomAccess(teacher, "class-a")).rejects.toBeInstanceOf(NotFoundException);
  });
});
