import { ConflictException, NotFoundException } from "@nestjs/common";
import { EducationAdminService } from "./education-admin.service";

const ORG_A = "00000000-0000-4000-8000-0000000000a1";
const ORG_B = "00000000-0000-4000-8000-0000000000b1";
const ROOM = "00000000-0000-4000-8000-0000000000c1";
const OFFERING = "00000000-0000-4000-8000-0000000000d1";
const NEW_OFFERING = "00000000-0000-4000-8000-0000000000d2";
const STUDENT = "00000000-0000-4000-8000-0000000000e1";

const actor = (organizationId: string, permissions: string[]) => ({
  authUserId: "auth-1", vistaUserId: "user-1", email: "admin@school.test", status: "active", systemRoleCodes: [], systemPermissions: [],
  memberships: [{ id: "m-1", organizationId, roleCode: "school_admin", status: "active", permissions }],
});
const schoolAdmin = actor(ORG_A, ["education.classroom.manage", "education.classroom.members.manage"]);
const instructor = actor(ORG_A, ["education.classroom.read"]);

describe("EducationAdminService classroom lifecycle", () => {
  const tx = {
    learning_classrooms: { update: jest.fn() },
    learning_classroom_members: { update: jest.fn(), findFirst: jest.fn() },
    learning_course_offerings: { findFirst: jest.fn() },
  };
  const findMember = tx.learning_classroom_members.findFirst;
  const findOffering = tx.learning_course_offerings.findFirst;
  const lockClassroomIn = jest.fn();
  const releaseIn = jest.fn();
  const synchronizeIfDeliverableIn = jest.fn();
  const transaction = jest.fn(async (work: (client: typeof tx) => unknown) => work(tx));
  const service = new EducationAdminService({ $transaction: transaction } as never, { isSystemAdministrator: jest.fn().mockReturnValue(false) } as never, {} as never, {} as never, { lockClassroomIn, releaseIn, synchronizeIfDeliverableIn } as never);
  const locked = (status = "active", offeringId = OFFERING, organizationId = ORG_A) => lockClassroomIn.mockResolvedValue({ id: ROOM, organization_id: organizationId, offering_id: offeringId, status });

  beforeEach(() => {
    [tx.learning_classrooms.update, tx.learning_classroom_members.update, findMember, findOffering, lockClassroomIn, releaseIn, synchronizeIfDeliverableIn, transaction].forEach((mock) => mock.mockClear());
    [findMember, findOffering, lockClassroomIn].forEach((mock) => mock.mockReset());
    locked();
    releaseIn.mockResolvedValue([]);
    synchronizeIfDeliverableIn.mockResolvedValue([]);
  });

  describe("authorization boundaries", () => {
    it.each([
      ["archive", () => service.archiveClassroom(schoolAdmin as never, ORG_B, ROOM)],
      ["reactivate", () => service.reactivateClassroom(schoolAdmin as never, ORG_B, ROOM)],
      ["change offering", () => service.changeClassroomOffering(schoolAdmin as never, ORG_B, ROOM, OFFERING)],
      ["remove student", () => service.removeClassroomStudent(schoolAdmin as never, ORG_B, ROOM, STUDENT)],
    ])("denies %s for an administrator of another organization before opening a transaction", async (_name, call) => {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
      expect(lockClassroomIn).not.toHaveBeenCalled();
      expect(tx.learning_classrooms.update).not.toHaveBeenCalled();
      expect(releaseIn).not.toHaveBeenCalled();
    });

    it.each([
      ["archive", () => service.archiveClassroom(instructor as never, ORG_A, ROOM)],
      ["change offering", () => service.changeClassroomOffering(instructor as never, ORG_A, ROOM, OFFERING)],
      ["remove student", () => service.removeClassroomStudent(instructor as never, ORG_A, ROOM, STUDENT)],
    ])("denies %s without the management permission", async (_name, call) => {
      await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      expect(transaction).not.toHaveBeenCalled();
      expect(releaseIn).not.toHaveBeenCalled();
    });

    it("locks the classroom first and treats a classroom of another organization as not found", async () => {
      locked("active", OFFERING, ORG_B);
      await expect(service.archiveClassroom(schoolAdmin as never, ORG_A, ROOM)).rejects.toBeInstanceOf(NotFoundException);
      expect(lockClassroomIn).toHaveBeenCalledWith(tx, ROOM);
      expect(tx.learning_classrooms.update).not.toHaveBeenCalled();
      expect(releaseIn).not.toHaveBeenCalled();
    });

    it("treats a missing classroom as not found", async () => {
      lockClassroomIn.mockResolvedValue(null);
      await expect(service.removeClassroomStudent(schoolAdmin as never, ORG_A, ROOM, STUDENT)).rejects.toBeInstanceOf(NotFoundException);
      expect(findMember).not.toHaveBeenCalled();
    });
  });

  describe("archive", () => {
    it("archives the classroom and releases its enrollments without deleting any learning record", async () => {
      releaseIn.mockResolvedValue([{ id: "e1", status: "revoked" }, { id: "e2", status: "revoked" }]);
      await expect(service.archiveClassroom(schoolAdmin as never, ORG_A, ROOM)).resolves.toEqual({ id: ROOM, status: "archived", releasedEnrollments: 2 });
      expect(tx.learning_classrooms.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "archived" }) }));
      expect(releaseIn).toHaveBeenCalledWith(tx, ROOM);
      expect(tx.learning_classroom_members.update).not.toHaveBeenCalled();
    });

    it("is idempotent for an already archived classroom", async () => {
      locked("archived");
      await service.archiveClassroom(schoolAdmin as never, ORG_A, ROOM);
      expect(tx.learning_classrooms.update).not.toHaveBeenCalled();
    });

    it("reads the status under the lock, so a concurrent change is never overwritten with a stale value", async () => {
      const order: string[] = [];
      lockClassroomIn.mockImplementation(async () => { order.push("lock"); return { id: ROOM, organization_id: ORG_A, offering_id: OFFERING, status: "active" }; });
      tx.learning_classrooms.update.mockImplementation(async () => { order.push("update"); });
      releaseIn.mockImplementation(async () => { order.push("release"); return []; });
      await service.archiveClassroom(schoolAdmin as never, ORG_A, ROOM);
      expect(order).toEqual(["lock", "update", "release"]);
    });
  });

  describe("reactivate", () => {
    it("restores the classroom and re-synchronizes eligible students without duplicating enrollments", async () => {
      locked("archived");
      synchronizeIfDeliverableIn.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
      await expect(service.reactivateClassroom(schoolAdmin as never, ORG_A, ROOM)).resolves.toEqual({ id: ROOM, status: "active", restoredEnrollments: 2 });
      expect(tx.learning_classrooms.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "active" }) }));
      expect(synchronizeIfDeliverableIn).toHaveBeenCalledWith(tx, ROOM);
    });

    it("reports zero restored enrollments when the course is not deliverable", async () => {
      locked("archived");
      synchronizeIfDeliverableIn.mockResolvedValue(null);
      await expect(service.reactivateClassroom(schoolAdmin as never, ORG_A, ROOM)).resolves.toMatchObject({ restoredEnrollments: 0 });
    });

    it("rejects a draft classroom", async () => {
      locked("draft");
      await expect(service.reactivateClassroom(schoolAdmin as never, ORG_A, ROOM)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("change offering", () => {
    it("rejects an offering that is inactive, draft-course based, school-owned or from another organization", async () => {
      findOffering.mockResolvedValue(null);
      await expect(service.changeClassroomOffering(schoolAdmin as never, ORG_A, ROOM, NEW_OFFERING)).rejects.toBeInstanceOf(NotFoundException);
      const where = findOffering.mock.calls[0][0].where;
      expect(where).toMatchObject({ id: NEW_OFFERING, organization_id: ORG_A, status: "active" });
      expect(where.learning_courses).toEqual({ is: { organization_id: null, status: "published" } });
      expect(tx.learning_classrooms.update).not.toHaveBeenCalled();
      expect(releaseIn).not.toHaveBeenCalled();
    });

    it("rejects changing the offering of an archived classroom", async () => {
      locked("archived");
      await expect(service.changeClassroomOffering(schoolAdmin as never, ORG_A, ROOM, NEW_OFFERING)).rejects.toBeInstanceOf(ConflictException);
      expect(findOffering).not.toHaveBeenCalled();
    });

    it("moves the classroom, releases access from the previous offering, then enrolls for the new one in one transaction", async () => {
      findOffering.mockResolvedValue({ id: NEW_OFFERING });
      const order: string[] = [];
      lockClassroomIn.mockImplementation(async () => { order.push("lock"); return { id: ROOM, organization_id: ORG_A, offering_id: OFFERING, status: "active" }; });
      tx.learning_classrooms.update.mockImplementation(async () => { order.push("update"); });
      releaseIn.mockImplementation(async () => { order.push("release"); return []; });
      synchronizeIfDeliverableIn.mockImplementation(async () => { order.push("sync"); return []; });
      await expect(service.changeClassroomOffering(schoolAdmin as never, ORG_A, ROOM, NEW_OFFERING)).resolves.toMatchObject({ id: ROOM, offeringId: NEW_OFFERING });
      expect(order).toEqual(["lock", "update", "release", "sync"]);
      expect(transaction).toHaveBeenCalledTimes(1);
    });

    it("does not release anyone when the offering is unchanged (idempotent)", async () => {
      findOffering.mockResolvedValue({ id: OFFERING });
      await service.changeClassroomOffering(schoolAdmin as never, ORG_A, ROOM, OFFERING);
      expect(tx.learning_classrooms.update).not.toHaveBeenCalled();
      expect(releaseIn).not.toHaveBeenCalled();
      expect(synchronizeIfDeliverableIn).toHaveBeenCalledWith(tx, ROOM);
    });
  });

  describe("remove student", () => {
    it("rejects a user who is not an active student of this classroom", async () => {
      findMember.mockResolvedValue(null);
      await expect(service.removeClassroomStudent(schoolAdmin as never, ORG_A, ROOM, STUDENT)).rejects.toBeInstanceOf(NotFoundException);
      expect(findMember).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ classroom_role: "student", status: "active" }) }));
      expect(releaseIn).not.toHaveBeenCalled();
    });

    it("marks the membership removed (never 'left') and releases only this student's classroom-derived access", async () => {
      findMember.mockResolvedValue({ id: "member-1" });
      releaseIn.mockResolvedValue([{ id: "e1", status: "revoked" }]);
      await expect(service.removeClassroomStudent(schoolAdmin as never, ORG_A, ROOM, STUDENT)).resolves.toEqual({ removed: true, enrollment: { id: "e1", status: "revoked" } });
      expect(tx.learning_classroom_members.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "member-1" }, data: expect.objectContaining({ status: "removed" }) }));
      expect(releaseIn).toHaveBeenCalledWith(tx, ROOM, STUDENT);
    });
  });
});
