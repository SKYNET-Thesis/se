import { ConflictException, NotFoundException } from "@nestjs/common";
import { EducationAdminService } from "./education-admin.service";
import { SchoolAdminQueryService } from "./school-admin-query.service";

/** Course offerings: one course can be delivered by many offerings (across and within schools); creation and listing stay tenant-scoped. */
describe("Course offerings", () => {
  const queryRaw = jest.fn();
  const findCourse = jest.fn();
  const createOffering = jest.fn();
  const scope = { isSystemAdministrator: jest.fn().mockReturnValue(false) };
  const prisma = { $queryRaw: queryRaw, learning_courses: { findFirst: findCourse }, learning_course_offerings: { create: createOffering } } as never;
  const service = new EducationAdminService(prisma, scope as never, {} as never, {} as never, {} as never);
  const queries = new SchoolAdminQueryService(prisma, scope as never);          // the offerings LIST is served by the query service
  const admin = (organizationId: string, permissions: string[]) => ({
    authUserId: "a", vistaUserId: "user-1", email: "admin@school.test", status: "active", systemRoleCodes: [], systemPermissions: [],
    memberships: [{ id: "m", organizationId, roleCode: "school_admin", status: "active", permissions }],
  }) as never;
  beforeEach(() => { queryRaw.mockReset(); findCourse.mockReset(); createOffering.mockReset(); scope.isSystemAdministrator.mockReturnValue(false); });

  describe("listing", () => {
    it("returns the school's offerings with the course, term, year and classroom count, scoped to that school", async () => {
      queryRaw.mockResolvedValue([{ id: "o1", code: "A", title: "Course", status: "draft", courseId: "c1", academicTerm: null, academicYear: null, classrooms: 0 }]);
      await expect(queries.offerings(admin("school-a", ["education.classroom.read"]), "school-a")).resolves.toEqual([expect.objectContaining({ courseId: "c1", classrooms: 0 })]);
      const sql = (queryRaw.mock.calls[0][0] as TemplateStringsArray).join("?");
      expect(sql).toContain('o.course_id AS "courseId"');
      expect(sql).toContain("o.organization_id=");
      expect(queryRaw.mock.calls[0][1]).toBe("school-a");                             // the organization id is the bound filter
    });
    it("refuses another school's administrator and a member without the read permission (404, no data)", async () => {
      await expect(Promise.resolve().then(() => queries.offerings(admin("school-b", ["education.classroom.read"]), "school-a"))).rejects.toBeInstanceOf(NotFoundException);
      await expect(Promise.resolve().then(() => queries.offerings(admin("school-a", ["education.members.read"]), "school-a"))).rejects.toBeInstanceOf(NotFoundException);
      expect(queryRaw).not.toHaveBeenCalled();
    });
    it("lets a system administrator read any school's offerings", async () => {
      scope.isSystemAdministrator.mockReturnValue(true); queryRaw.mockResolvedValue([]);
      await expect(queries.offerings({ ...(admin("x", []) as object), systemRoleCodes: ["system_admin"] } as never, "school-a")).resolves.toEqual([]);
    });
  });

  describe("creation", () => {
    const dto = { courseId: "course-1", code: " FALL-1 ", title: " Fall class ", academicTerm: "Fall", academicYear: 2026 };
    it("creates a DRAFT offering of a published course for the caller's school, trimming input and never copying content", async () => {
      findCourse.mockResolvedValue({ id: "course-1", title: "SO-101" }); createOffering.mockResolvedValue({ id: "o1" });
      await service.createCourseOffering(admin("school-a", ["education.classroom.manage"]), "school-a", dto);
      expect(findCourse).toHaveBeenCalledWith({ where: { id: "course-1", status: "published", OR: [{ organization_id: null }, { organization_id: "school-a" }] }, select: { id: true, title: true } });
      expect(createOffering).toHaveBeenCalledWith({ data: expect.objectContaining({ organization_id: "school-a", course_id: "course-1", code: "FALL-1", title: "Fall class", status: "draft" }) });
      expect(Object.keys(createOffering.mock.calls[0][0].data)).not.toEqual(expect.arrayContaining(["lessons", "sections", "content"]));   // a reference to the course, not a copy
    });
    it("supports several offerings of one course: a second code for the same course and school is accepted", async () => {
      findCourse.mockResolvedValue({ id: "course-1", title: "SO-101" }); createOffering.mockResolvedValue({ id: "o2" });
      const caller = admin("school-a", ["education.classroom.manage"]);
      await service.createCourseOffering(caller, "school-a", { ...dto, code: "FALL-1" });
      await service.createCourseOffering(caller, "school-a", { ...dto, code: "SPRING-1" });
      expect(createOffering).toHaveBeenCalledTimes(2);
    });
    it("rejects a course that is unpublished or belongs to another school (the lookup finds nothing)", async () => {
      findCourse.mockResolvedValue(null);
      await expect(service.createCourseOffering(admin("school-a", ["education.classroom.manage"]), "school-a", dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(createOffering).not.toHaveBeenCalled();
    });
    it("refuses a caller who is not a manager of that school: other school, or read-only permission", async () => {
      await expect(service.createCourseOffering(admin("school-b", ["education.classroom.manage"]), "school-a", dto)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.createCourseOffering(admin("school-a", ["education.classroom.read"]), "school-a", dto)).rejects.toBeInstanceOf(NotFoundException);
      expect(findCourse).not.toHaveBeenCalled(); expect(createOffering).not.toHaveBeenCalled();
    });
    it("reports a duplicate code in the same school as a conflict", async () => {
      findCourse.mockResolvedValue({ id: "course-1", title: "SO-101" }); createOffering.mockRejectedValue({ code: "P2002" });
      await expect(service.createCourseOffering(admin("school-a", ["education.classroom.manage"]), "school-a", dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
