import { readFileSync } from "node:fs";
import { join } from "node:path";
import { enrollClassroomStudent } from "./demo-enrollment";

const input = { courseId: "course-1", offeringId: "offering-1", classroomId: "classroom-a", studentUserId: "student-1" };

describe("classroom student enrollment for scripted delivery", () => {
  it("writes one idempotent, classroom-scoped active enrollment (the row GET /me/learning joins on)", async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ id: "enrollment-1" }]);
    await expect(enrollClassroomStudent({ $queryRaw: queryRaw } as never, input)).resolves.toEqual({ id: "enrollment-1" });
    const [strings, ...values] = queryRaw.mock.calls[0] as [TemplateStringsArray, ...string[]];
    const sql = strings.join("?");
    expect(sql).toContain("INSERT INTO public.learning_enrollments(course_id, learner_user_id, offering_id, classroom_id, status, enrolled_at)");
    expect(sql).toContain("ON CONFLICT (course_id, learner_user_id, classroom_id)");
    expect(sql).toContain("'completed' THEN 'completed'"); // never reopens a completed enrollment
    expect(values).toEqual(["course-1", "student-1", "offering-1", "classroom-a"]);
  });

  it("fails loudly instead of leaving a member without an enrollment", async () => {
    await expect(enrollClassroomStudent({ $queryRaw: jest.fn().mockResolvedValue([]) } as never, input)).rejects.toThrow("enrollment could not be created");
  });

  // Regression: seed-demo-delivery inserted the student membership of "Robotics Class A" without an enrollment, so a
  // published delivery never reached the student's Assignments page. The script runs on import, so guard its source.
  it.each(["seed-demo-delivery.ts", "course1-demo-delivery.ts"])("%s enrolls every student it adds to a classroom", (file) => {
    const source = readFileSync(join(__dirname, file), "utf8");
    const memberAt = source.lastIndexOf('classroom_role: "student"');
    expect(memberAt).toBeGreaterThan(-1);
    expect(source.indexOf("enrollClassroomStudent(tx", memberAt)).toBeGreaterThan(memberAt);
  });
});
