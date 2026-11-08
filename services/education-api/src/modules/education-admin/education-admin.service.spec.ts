import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { EducationAdminService } from "./education-admin.service";

const baseUser = {
  authUserId: "auth-1", vistaUserId: "user-1", email: "admin@school.test", status: "active",
  systemRoleCodes: [], systemPermissions: [], memberships: [],
};

describe("EducationAdminService organization boundaries", () => {
  const queryRaw = jest.fn();
  const findOffering = jest.fn();
  const createClassroom = jest.fn();
  const findClassroom = jest.fn();
  const transaction = jest.fn();
  const scope = { isSystemAdministrator: jest.fn() };
  const supabaseAdmin = { invite: jest.fn() };
  const studentProvisioning = { provision: jest.fn() };
  const service = new EducationAdminService({ $queryRaw: queryRaw, $transaction: transaction, learning_course_offerings: { findFirst: findOffering }, learning_classrooms: { create: createClassroom, findFirst: findClassroom }, memberships: { findFirst: jest.fn() }, learning_classroom_members: { upsert: jest.fn() } } as never, scope as never, supabaseAdmin as never, studentProvisioning as never);

  beforeEach(() => { queryRaw.mockReset(); transaction.mockReset().mockImplementation(async (callback) => callback({ $queryRaw: jest.fn().mockResolvedValue([{ id: "allocation-a", classroom_id: "class-a", robot_id: "robot-a" }]) })); findOffering.mockReset(); createClassroom.mockReset(); findClassroom.mockReset().mockResolvedValue({ id: "class-a", organization_id: "school-a" }); scope.isSystemAdministrator.mockReset().mockReturnValue(false); });

  it("allows a school administrator to read members in the organization carrying the permission", async () => {
    queryRaw.mockResolvedValue([]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.read"] }] };
    await expect(service.members(user, "school-a")).resolves.toEqual([]);
  });

  it("does not reveal members of another school even when the permission exists elsewhere", async () => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.read"] }] };
    await expect(service.members(user, "school-b")).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("allows only the existing system administrator authority across organizations", async () => {
    scope.isSystemAdministrator.mockReturnValue(true);
    queryRaw.mockResolvedValue([]);
    await expect(service.members(baseUser, "school-b")).resolves.toEqual([]);
  });

  it("allows classroom reads only in the school administrator's own organization", async () => {
    queryRaw.mockResolvedValue([]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.read"] }] };
    await expect(service.classrooms(user, "school-a")).resolves.toEqual([]);
    await expect(service.classrooms(user, "school-b")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("does not allow a school administrator to read another school's classroom roster", async () => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.read"] }] };
    await expect(service.classroomMembers(user, "school-b", "class-b")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates a classroom only in the authorized organization and only from its offering", async () => {
    findOffering.mockResolvedValue({ id: "offering-a" });
    createClassroom.mockResolvedValue({ id: "class-a", organization_id: "school-a" });
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.manage"] }] };
    await expect(service.createClassroom(user, "school-a", { offeringId: "offering-a", name: "Class A", code: "A" })).resolves.toMatchObject({ id: "class-a" });
    expect(findOffering).toHaveBeenCalledWith({
      where: { id: "offering-a", organization_id: "school-a", status: "active", learning_courses: { is: { organization_id: null, status: "published" } } },
      select: { id: true },
    });
    await expect(service.createClassroom(user, "school-b", { offeringId: "offering-a", name: "Class B", code: "B" })).rejects.toBeInstanceOf(NotFoundException);
    expect(createClassroom).toHaveBeenCalledTimes(1);
  });

  it("rejects a classroom built on an inactive or unpublished offering", async () => {
    findOffering.mockResolvedValue(null);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.manage"] }] };
    await expect(service.createClassroom(user, "school-a", { offeringId: "offering-a", name: "Class A", code: "A" })).rejects.toBeInstanceOf(NotFoundException);
    expect(createClassroom).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only classroom name or code", async () => {
    findOffering.mockResolvedValue({ id: "offering-a" });
    createClassroom.mockResolvedValue({ id: "class-a", organization_id: "school-a" });
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.manage"] }] };
    await expect(service.createClassroom(user, "school-a", { offeringId: "offering-a", name: "   ", code: "A" })).rejects.toBeInstanceOf(BadRequestException);
    expect(createClassroom).not.toHaveBeenCalled();
  });

  it("rejects allocation before mutating when the school administrator lacks the allocation permission", async () => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.manage"] }] };
    await expect(service.allocateRobot(user, "class-a", { robotId: "robot-a" })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("persists one allocation for an entitled robot", async () => {
    queryRaw.mockResolvedValue([{ id: "robot-a" }]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.resource.allocate"] }] };
    await expect(service.allocateRobot(user, "class-a", { robotId: "robot-a" })).resolves.toMatchObject([{ robot_id: "robot-a" }]);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a school administrator from another organization before mutation", async () => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.resource.allocate"] }] };
    findClassroom.mockResolvedValue({ id: "class-b", organization_id: "school-b" });
    await expect(service.allocateRobot(user, "class-b", { robotId: "robot-a" })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });

  it.each(["instructor", "student", "teaching_assistant"])("rejects %s allocation attempts", async (roleCode) => {
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode, status: "active", permissions: [] }] };
    await expect(service.allocateRobot(user, "class-a", { robotId: "robot-a" })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled(); expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a robot without a current entitlement before mutation", async () => {
    queryRaw.mockResolvedValue([]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.resource.allocate"] }] };
    await expect(service.allocateRobot(user, "class-a", { robotId: "robot-a" })).rejects.toBeInstanceOf(NotFoundException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("uses the single-row upsert transaction for replacement and repeated allocation", async () => {
    queryRaw.mockResolvedValue([{ id: "robot-b" }]);
    const user = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.resource.allocate"] }] };
    await service.allocateRobot(user, "class-a", { robotId: "robot-b" });
    await service.allocateRobot(user, "class-a", { robotId: "robot-b" });
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});

describe("EducationAdminService role derivation and provisioning scope", () => {
  const findClassroom = jest.fn().mockResolvedValue({ id: "class-a", organization_id: "school-a" });
  const findMembership = jest.fn(); const upsert = jest.fn(); const queryRaw = jest.fn(); const invite = jest.fn();
  const findOrganization = jest.fn();
  const scope = { isSystemAdministrator: jest.fn().mockReturnValue(false) };
  const service = new EducationAdminService({ $queryRaw: queryRaw, organizations: { findUnique: findOrganization }, learning_classrooms: { findFirst: findClassroom }, memberships: { findFirst: findMembership }, learning_classroom_members: { upsert }, $transaction: jest.fn() } as never, scope as never, { invite } as never, { provision: jest.fn().mockResolvedValue({ status: "unchanged" }) } as never);
  const schoolAdmin = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.members.manage", "education.members.provision"] }] };

  beforeEach(() => { findMembership.mockReset(); upsert.mockReset().mockResolvedValue({ id: "cm-1" }); queryRaw.mockReset(); findOrganization.mockReset().mockResolvedValue({ school_code: "VST-SCHOOL" }); invite.mockReset(); });

  it.each([["student", "student"], ["instructor", "teacher"]])("derives %s membership as classroom role %s", async (organizationRole, classroomRole) => {
    findMembership.mockResolvedValue({ id: "membership-a", status: "active", roles: { code: organizationRole } });
    await service.upsertClassroomMember(schoolAdmin, "school-a", "class-a", { userId: "00000000-0000-4000-8000-000000000001" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ classroom_role: classroomRole }), update: expect.objectContaining({ classroom_role: classroomRole }) }));
  });

  it("synchronizes enrollment after adding an eligible student", async () => {
    const synchronizeClassroom = jest.fn().mockResolvedValue([]);
    const enrolledService = new EducationAdminService(
      { learning_classrooms: { findFirst: findClassroom }, memberships: { findFirst: findMembership }, learning_classroom_members: { upsert } } as never,
      scope as never, { invite } as never, { provision: jest.fn() } as never,
      { synchronizeClassroom } as never,
    );
    findMembership.mockResolvedValue({ id: "membership-a", status: "active", roles: { code: "student" } });

    await enrolledService.upsertClassroomMember(schoolAdmin, "school-a", "class-a", { userId: "00000000-0000-4000-8000-000000000001" });

    expect(synchronizeClassroom).toHaveBeenCalledWith("class-a");
  });

  it('soft-revokes a member and only their enrollment in the selected classroom', async () => {
    const txQuery = jest.fn().mockResolvedValue([{ member_id: 'member-1', enrollment_id: 'enrollment-1' }]);
    const revokeService = new EducationAdminService(
      { learning_classrooms: { findFirst: findClassroom }, $transaction: jest.fn(async work => work({ $queryRaw: txQuery })) } as never,
      scope as never, { invite } as never, { provision: jest.fn() } as never,
    );

    await revokeService.revokeClassroomMember(schoolAdmin, 'school-a', 'class-a', 'student-1');

    const sql = String(txQuery.mock.calls[0][0]);
    expect(sql).toContain("SET status='left'");
    expect(sql).toContain("SET status='revoked'");
    expect(sql).toContain('classroom_id');
  });

  it('archives a classroom by revoking its active enrollments without deleting history', async () => {
    const txQuery = jest.fn().mockResolvedValue([{ id: 'class-a', status: 'archived' }]);
    const archiveService = new EducationAdminService(
      { learning_classrooms: { findFirst: findClassroom }, $transaction: jest.fn(async work => work({ $queryRaw: txQuery })) } as never,
      scope as never, { invite } as never, { provision: jest.fn() } as never,
    );
    await archiveService.archiveClassroom({ ...schoolAdmin, memberships: [{ ...schoolAdmin.memberships[0], permissions: ['education.classroom.manage'] }] }, 'school-a', 'class-a');
    const sql = String(txQuery.mock.calls[0][0]);
    expect(sql).toContain("SET status='archived'");
    expect(sql).toContain("SET status='revoked'");
  });

  it('reassigns a classroom offering by revoking obsolete access and upserting the new enrollment set', async () => {
    const txQuery = jest.fn().mockResolvedValue([{ id: 'class-a', offering_id: 'offering-b' }]);
    const offering = jest.fn().mockResolvedValue({ id: 'offering-b', course_id: 'course-b' });
    const reassignmentService = new EducationAdminService(
      { learning_classrooms: { findFirst: findClassroom }, learning_course_offerings: { findFirst: offering }, $transaction: jest.fn(async work => work({ $queryRaw: txQuery })) } as never,
      scope as never, {} as never, {} as never,
    );
    await reassignmentService.assignClassroomOffering({ ...schoolAdmin, memberships: [{ ...schoolAdmin.memberships[0], permissions: ['education.classroom.manage'] }] }, 'school-a', 'class-a', 'offering-b');
    const sql = String(txQuery.mock.calls[0][0]);
    expect(sql).toContain("SET status='revoked'");
    expect(sql).toContain('ON CONFLICT (course_id, learner_user_id, classroom_id)');
  });

  it('edits only supported classroom metadata within the administrator school', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'class-a', name: 'Updated' });
    const editService = new EducationAdminService(
      { learning_classrooms: { findFirst: findClassroom, update } } as never,
      scope as never, {} as never, {} as never,
    );
    await expect(editService.updateClassroom({ ...schoolAdmin, memberships: [{ ...schoolAdmin.memberships[0], permissions: ['education.classroom.manage'] }] }, 'school-a', 'class-a', { name: 'Updated', description: 'New details', capacity: 30 }))
      .resolves.toMatchObject({ name: 'Updated' });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'class-a' }, data: expect.objectContaining({ name: 'Updated', description: 'New details', capacity: 30 }) }));
  });

  it("rejects an unsupported organization role", async () => {
    findMembership.mockResolvedValue({ id: "membership-a", status: "active", roles: { code: "school_admin" } });
    await expect(service.upsertClassroomMember(schoolAdmin, "school-a", "class-a", { userId: "00000000-0000-4000-8000-000000000001" })).rejects.toBeInstanceOf(ConflictException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects provisioning outside the authenticated organization before mutation", async () => {
    await expect(service.importUsers(schoolAdmin, "school-b", { kind: "students", rows: [{ firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled(); expect(invite).not.toHaveBeenCalled();
  });

  it.each(["instructor", "student"])("rejects %s user provisioning", async roleCode => {
    const actor = { ...baseUser, memberships: [{ id: "m-2", organizationId: "school-a", roleCode, status: "active", permissions: [] }] };
    await expect(service.importUsers(actor, "school-a", { kind: "students", rows: [{ firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "Grade 3" }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(queryRaw).not.toHaveBeenCalled(); expect(invite).not.toHaveBeenCalled();
  });

  it("rejects invalid rows server-side without provisioning", async () => {
    const result = await service.importUsers(schoolAdmin, "school-a", { kind: "students", rows: [{ firstName: "Bao", lastName: "Ngoc" }] });
    expect(result).toMatchObject({ processed: 1, created: 0, failed: 1 });
    expect(result.results[0].message).toContain("Student code is required");
    expect(queryRaw).not.toHaveBeenCalled(); expect(invite).not.toHaveBeenCalled();
  });

  it("returns unchanged for an existing organization-scoped student code", async () => {
    queryRaw.mockResolvedValue([{ code: "vista-stu-001" }]);
    const result = await service.importUsers(schoolAdmin, "school-a", { kind: "students", rows: [{ firstName: "Bao", lastName: "Ngoc", studentCode: "VISTA-STU-001", gradeLevel: "Grade 3" }] });
    expect(result).toMatchObject({ processed: 1, created: 0, unchanged: 1, failed: 0 });
    expect(invite).not.toHaveBeenCalled();
  });
});

describe("EducationAdminService school user provisioning", () => {
  const queryRaw = jest.fn(); const transaction = jest.fn(); const invite = jest.fn(); const provision = jest.fn();
  const findOrganization = jest.fn();
  const prisma = { $queryRaw: queryRaw, $transaction: transaction, organizations: { findUnique: findOrganization } };
  const scope = { isSystemAdministrator: jest.fn().mockReturnValue(false) };
  const service = new EducationAdminService(prisma as never, scope as never, { invite } as never, { provision } as never);
  const actor = { ...baseUser, memberships: [{ id: "m-1", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.members.provision"] }] };

  beforeEach(() => { queryRaw.mockReset().mockResolvedValue([]); findOrganization.mockReset().mockResolvedValue({ school_code: "VST-SCHOOL" }); invite.mockReset(); provision.mockReset().mockResolvedValue({ userId: "user-new", status: "created", setupCode: "one-time-code" }); transaction.mockReset(); });

  it("provisions a no-email student and returns its one-time setup code", async () => {
    const row = { firstName: "Bao", lastName: "Ngoc", studentCode: "VISTA-STU-001", gradeLevel: "Grade 3", guardianEmail: "parent@example.com" };
    const result = await service.importUsers(actor, "school-a", { kind: "students", rows: [row] });
    expect(result).toMatchObject({ created: 1, failed: 0, schoolCode: "VST-SCHOOL", results: [{ setupCode: "one-time-code" }] });
    expect(provision).toHaveBeenCalledWith("school-a", row);
    expect(invite).not.toHaveBeenCalled();
  });

  it("issues a scoped, expiring password recovery code and stores only its hash", async () => {
    queryRaw.mockResolvedValue([{ id: "student-1" }]);
    const txQueryRaw = jest.fn().mockResolvedValue([{ locked: 1 }]);
    const txExecuteRaw = jest.fn().mockResolvedValue(1);
    transaction.mockImplementation(callback => callback({ $queryRaw: txQueryRaw, $executeRaw: txExecuteRaw }));

    const before = Date.now();
    const result = await service.issueStudentPasswordRecovery(actor, "school-a", "student-1");
    const expiresAt = new Date(result.expiresAt).getTime();

    expect(result.recoveryCode).toHaveLength(32);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 30 * 60 * 1000);
    expect(txExecuteRaw).toHaveBeenCalledTimes(3);
    expect(txExecuteRaw.mock.calls[1]).toContain(createHash("sha256").update(result.recoveryCode, "utf8").digest("hex"));
    expect(txExecuteRaw.mock.calls.flat()).not.toContain(result.recoveryCode);
    expect(txExecuteRaw.mock.calls[2][0].join(" ")).toContain("student.password_recovery.issued");
    expect(queryRaw.mock.calls[0][0].join(" ")).toContain("p.account_state = 'active'");
  });

  it("does not issue a password recovery code without the school provisioning permission", async () => {
    const otherActor = { ...baseUser, memberships: [{ id: "m-2", organizationId: "school-a", roleCode: "teacher", status: "active", permissions: [] }] };

    await expect(service.issueStudentPasswordRecovery(otherActor, "school-a", "student-1")).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRaw).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("keeps student contact email separate from the provider login identifier", async () => {
    const row = { firstName: "Minh", lastName: "Khoa", studentCode: "VISTA-STU-003", gradeLevel: "Grade 7", email: "minh@example.com" };
    const result = await service.importUsers(actor, "school-a", { kind: "students", rows: [row] });
    expect(provision).toHaveBeenCalledWith("school-a", row); expect(result).toMatchObject({ created: 1, failed: 0 }); expect(invite).not.toHaveBeenCalled();
  });

  it("returns a safe classified account setup failure", async () => {
    const { ImportProvisioningError } = await import("./import-errors"); provision.mockRejectedValue(new ImportProvisioningError("ACCOUNT_PROVISIONING_FAILED", "raw Supabase provider failure"));
    const result = await service.importUsers(actor, "school-a", { kind: "students", rows: [{ firstName: "Minh", lastName: "Khoa", studentCode: "S3", gradeLevel: "7", email: "minh@example.com" }] });
    expect(result.results[0]).toMatchObject({ status: "failed", code: "ACCOUNT_PROVISIONING_FAILED", message: "We couldn't create this account. Please try again." });
    expect(JSON.stringify(result)).not.toMatch(/Supabase|SMTP|queryRaw|23514/);
  });

  it("returns a safe database failure without raw infrastructure details", async () => {
    provision.mockRejectedValue(new Error("Invalid prisma.$queryRaw ERROR 23514 users_signup_method_check"));
    const result = await service.importUsers(actor, "school-a", { kind: "students", rows: [{ firstName: "Bao", lastName: "Ngoc", studentCode: "S1", gradeLevel: "3" }] });
    expect(result.results[0]).toMatchObject({ status: "failed", code: "DATABASE_WRITE_FAILED", message: "We couldn't save this user. Please try again." });
    expect(JSON.stringify(result)).not.toMatch(/prisma|23514|constraint/i);
  });

  it("prefetches existing student codes once for an idempotent 20-row reimport", async () => {
    provision.mockResolvedValue({ userId: "user-existing", status: "unchanged" });
    const rows = Array.from({ length: 20 }, (_, index) => ({
      firstName: "Student",
      lastName: String(index + 1),
      studentCode: `VISTA-BULK-STU-${String(index + 1).padStart(3, "0")}`,
      gradeLevel: `Grade ${(index % 5) + 3}`,
    }));
    queryRaw.mockResolvedValue(rows.map(row => ({ code: row.studentCode.toLowerCase() })));

    const result = await service.importUsers(actor, "school-a", { kind: "students", rows });

    expect(result).toMatchObject({ processed: 20, created: 0, unchanged: 20, failed: 0 });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(provision).toHaveBeenCalledTimes(20);
    expect(invite).not.toHaveBeenCalled();
  });

  it("prefetches existing teacher codes once for an idempotent five-row reimport", async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      firstName: "Teacher",
      lastName: String(index + 1),
      employeeCode: `VISTA-BULK-TEA-${String(index + 1).padStart(3, "0")}`,
      email: `teacher${index + 1}@school.test`,
    }));
    queryRaw.mockResolvedValue(rows.map(row => ({ code: row.employeeCode.toLowerCase() })));

    const result = await service.importUsers(actor, "school-a", { kind: "teachers", rows });

    expect(result).toMatchObject({ processed: 5, created: 0, unchanged: 5, failed: 0 });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
    expect(invite).not.toHaveBeenCalled();
  });
});
