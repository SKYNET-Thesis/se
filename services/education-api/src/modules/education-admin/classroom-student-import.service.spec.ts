import { NotFoundException } from "@nestjs/common";
import { ClassroomStudentImportService } from "./classroom-student-import.service";

const actor = {
  authUserId: "auth-1", vistaUserId: "user-1", email: "admin@school.test", status: "active",
  systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id: "m-admin", organizationId: "school-a", roleCode: "school_admin", status: "active", permissions: ["education.classroom.members.manage", "education.members.provision"] }],
};

describe("ClassroomStudentImportService preview", () => {
  const findClassroom = jest.fn();
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const invite = jest.fn();
  const provision = jest.fn();
  const addExisting = jest.fn();
  const scope = { isSystemAdministrator: jest.fn().mockReturnValue(false) };
  const service = new ClassroomStudentImportService(
    { learning_classrooms: { findFirst: findClassroom }, $queryRaw: queryRaw, $transaction: transaction } as never,
    scope as never,
    { provision, addExistingStudentToClassroom: addExisting, invite } as never,
  );

  beforeEach(() => {
    findClassroom.mockReset().mockResolvedValue({ id: "class-a", organization_id: "school-a" });
    queryRaw.mockReset().mockResolvedValue([]);
    transaction.mockReset(); invite.mockReset(); provision.mockReset(); addExisting.mockReset();
  });

  it("classifies new, existing, and already-in-class students without side effects", async () => {
    queryRaw.mockResolvedValue([
      { code: "existing-1", userId: "user-existing", membershipId: "membership-existing", roleCode: "student", fullName: "Master Name", email: null, gradeLevel: "Grade 4", guardianEmail: null, classroomMemberId: null },
      { code: "member-1", userId: "user-member", membershipId: "membership-member", roleCode: "student", fullName: "Member Name", email: null, gradeLevel: "Grade 5", guardianEmail: null, classroomMemberId: "class-member-1" },
    ]);

    const result = await service.preview(actor, "school-a", "class-a", { rows: [
      { firstName: "New", lastName: "Student", studentCode: "NEW-1", gradeLevel: "Grade 3" },
      { firstName: "CSV", lastName: "Name", studentCode: "EXISTING-1", gradeLevel: "Grade 6" },
      { firstName: "Member", lastName: "Name", studentCode: "MEMBER-1", gradeLevel: "Grade 5" },
    ] });

    expect(result).toMatchObject({ processed: 3, newStudents: 1, existingStudents: 1, alreadyInClass: 1, needsReview: 0 });
    expect(result.rows.map(item => item.status)).toEqual(["new_student", "existing_student", "already_in_class"]);
    expect(result.rows[1].warnings).toContain("Profile data differs from CSV.");
    expect(transaction).not.toHaveBeenCalled();
    expect(invite).not.toHaveBeenCalled();
    expect(provision).not.toHaveBeenCalled();
    expect(addExisting).not.toHaveBeenCalled();
  });

  it("marks duplicate and invalid rows for review without resolving them", async () => {
    const result = await service.preview(actor, "school-a", "class-a", { rows: [
      { firstName: "", lastName: "Student", studentCode: "DUP-1", gradeLevel: "" },
      { firstName: "Valid", lastName: "Student", studentCode: "DUP-1", gradeLevel: "Grade 3" },
    ] });

    expect(result).toMatchObject({ processed: 2, needsReview: 2 });
    expect(result.rows.every(item => item.status === "needs_review")).toBe(true);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("marks every occurrence of a duplicate student code for review", async () => {
    const result = await service.preview(actor, "school-a", "class-a", { rows: [
      { firstName: "First", lastName: "Student", studentCode: "DUP-1", gradeLevel: "Grade 3" },
      { firstName: "Second", lastName: "Student", studentCode: "dup-1", gradeLevel: "Grade 4" },
    ] });
    expect(result.rows.map(item => item.status)).toEqual(["needs_review", "needs_review"]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns malformed optional email as a row review issue", async () => {
    const result = await service.preview(actor, "school-a", "class-a", { rows: [{ firstName: "A", lastName: "B", studentCode: "S1", gradeLevel: "Grade 3", email: "bad-email" }] });
    expect(result.rows[0]).toMatchObject({ status: "needs_review", errors: ["Email is malformed."] });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("denies a classroom outside the authorized organization before querying students", async () => {
    await expect(service.preview(actor, "school-b", "class-b", { rows: [{ firstName: "A", lastName: "B", studentCode: "S1", gradeLevel: "Grade 3" }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(findClassroom).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
describe("ClassroomStudentImportService confirm", () => {
  const findClassroom = jest.fn().mockResolvedValue({ id: "class-a", organization_id: "school-a" });
  const queryRaw = jest.fn();
  const provision = jest.fn();
  const addExisting = jest.fn();
  const scope = { isSystemAdministrator: jest.fn().mockReturnValue(false) };
  const service = new ClassroomStudentImportService(
    { learning_classrooms: { findFirst: findClassroom }, $queryRaw: queryRaw } as never,
    scope as never,
    { provision, addExistingStudentToClassroom: addExisting } as never,
  );

  beforeEach(() => {
    findClassroom.mockReset().mockResolvedValue({ id: "class-a", organization_id: "school-a" });
    queryRaw.mockReset().mockResolvedValue([]);
    provision.mockReset().mockResolvedValue({ userId: "user-new" });
    addExisting.mockReset().mockResolvedValue(undefined);
  });

  it("creates a new student, reuses an existing student, and leaves an existing classroom member unchanged", async () => {
    queryRaw.mockResolvedValue([
      { code: "existing-1", userId: "user-existing", membershipId: "membership-existing", roleCode: "student", fullName: "Existing Student", email: null, gradeLevel: "Grade 4", guardianEmail: null, classroomMemberId: null },
      { code: "member-1", userId: "user-member", membershipId: "membership-member", roleCode: "student", fullName: "Member Student", email: null, gradeLevel: "Grade 5", guardianEmail: null, classroomMemberId: "cm-1" },
    ]);
    const rows = [
      { firstName: "New", lastName: "Student", studentCode: "NEW-1", gradeLevel: "Grade 3" },
      { firstName: "Existing", lastName: "Student", studentCode: "EXISTING-1", gradeLevel: "Grade 4" },
      { firstName: "Member", lastName: "Student", studentCode: "MEMBER-1", gradeLevel: "Grade 5" },
    ];

    const result = await service.confirm(actor, "school-a", "class-a", { rows });

    expect(result).toMatchObject({ processed: 3, createdAndAdded: 1, existingAdded: 1, unchanged: 1, failed: 0 });
    expect(result.results.map(item => item.status)).toEqual(["created_and_added", "existing_added", "unchanged"]);
    expect(provision).toHaveBeenCalledWith("school-a", rows[0], "class-a");
    expect(addExisting).toHaveBeenCalledWith({ userId: "user-existing", membershipId: "membership-existing" }, "class-a");
  });

  it("reimport is idempotent and does not provision or add rows already in the classroom", async () => {
    queryRaw.mockResolvedValue([{ code: "member-1", userId: "user-member", membershipId: "membership-member", roleCode: "student", fullName: "Member Student", email: null, gradeLevel: "Grade 5", guardianEmail: null, classroomMemberId: "cm-1" }]);
    const result = await service.confirm(actor, "school-a", "class-a", { rows: [{ firstName: "Member", lastName: "Student", studentCode: "MEMBER-1", gradeLevel: "Grade 5" }] });
    expect(result).toMatchObject({ unchanged: 1, createdAndAdded: 0, existingAdded: 0, failed: 0 });
    expect(provision).not.toHaveBeenCalled();
    expect(addExisting).not.toHaveBeenCalled();
  });

  it("returns a safe row failure and does not add membership when provisioning fails", async () => {
    provision.mockRejectedValue(new Error("raw database failure"));
    const result = await service.confirm(actor, "school-a", "class-a", { rows: [{ firstName: "New", lastName: "Student", studentCode: "NEW-1", gradeLevel: "Grade 3" }] });
    expect(result).toMatchObject({ failed: 1, createdAndAdded: 0 });
    expect(result.results[0]).toMatchObject({ status: "failed" });
    expect(JSON.stringify(result)).not.toContain("raw database failure");
    expect(addExisting).not.toHaveBeenCalled();
  });

  it("reuses the same organization student when importing into another classroom", async () => {
    findClassroom.mockResolvedValue({ id: "class-b", organization_id: "school-a" });
    queryRaw.mockResolvedValue([{ code: "existing-1", userId: "user-existing", membershipId: "membership-existing", roleCode: "student", fullName: "Existing Student", email: null, gradeLevel: "Grade 4", guardianEmail: null, classroomMemberId: null }]);
    const result = await service.confirm(actor, "school-a", "class-b", { rows: [{ firstName: "Existing", lastName: "Student", studentCode: "EXISTING-1", gradeLevel: "Grade 4" }] });
    expect(result).toMatchObject({ existingAdded: 1, createdAndAdded: 0 });
    expect(addExisting).toHaveBeenCalledWith({ userId: "user-existing", membershipId: "membership-existing" }, "class-b");
    expect(provision).not.toHaveBeenCalled();
  });

  it("denies confirm outside the authorized organization before any mutation", async () => {
    await expect(service.confirm(actor, "school-b", "class-b", { rows: [{ firstName: "A", lastName: "B", studentCode: "S1", gradeLevel: "Grade 3" }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(provision).not.toHaveBeenCalled(); expect(addExisting).not.toHaveBeenCalled();
  });

  it("rejects an existing profile whose active organization role is not student", async () => {
    queryRaw.mockResolvedValue([{ code: "s1", userId: "user-1", membershipId: "membership-1", roleCode: "instructor", fullName: "A B", email: null, gradeLevel: "Grade 3", guardianEmail: null, classroomMemberId: null }]);
    const result = await service.confirm(actor, "school-a", "class-a", { rows: [{ firstName: "A", lastName: "B", studentCode: "S1", gradeLevel: "Grade 3" }] });
    expect(result).toMatchObject({ failed: 1, existingAdded: 0, createdAndAdded: 0 });
    expect(provision).not.toHaveBeenCalled(); expect(addExisting).not.toHaveBeenCalled();
  });
});
