import { Prisma } from "@prisma/client";
import { coursePrerequisiteMessage, parsePrerequisitePolicy, parseUnmet, prerequisitePolicyFromEnv, unmetCoursePrerequisitesSql } from "./course-prerequisites";

describe("prerequisite enforcement policy (COURSE_PREREQUISITES_ENFORCED_FROM)", () => {
  it.each([undefined, null, "", "  ", "disabled", "OFF", "false", "0", "none"])("%p disables enforcement without an error", (raw) => {
    expect(parsePrerequisitePolicy(raw)).toEqual({ mode: "disabled" });
  });
  it("enforces for everyone only with the explicit keyword", () => {
    expect(parsePrerequisitePolicy("always")).toEqual({ mode: "all" });
    expect(parsePrerequisitePolicy(" ALWAYS ")).toEqual({ mode: "all" });
  });
  it.each(["2026-12-01T00:00:00Z", "2026-12-01T00:00Z", "2026-12-01T07:00:00+07:00", "2026-12-01T00:00:00.250Z"])("accepts the cutoff %s", (raw) => {
    const policy = parsePrerequisitePolicy(raw);
    expect(policy.mode).toBe("from");
    expect((policy as { cutoff: Date }).cutoff.getTime()).toBe(new Date(raw).getTime());
  });
  it.each(["2026-12-01", "2026-12-01T00:00:00", "tomorrow", "2026-13-45T00:00:00Z", "true", "1", "yes", "2026-12-01 00:00:00Z"])("treats %p as INVALID and therefore disabled, never as enforcement", (raw) => {
    const policy = parsePrerequisitePolicy(raw);
    expect(policy.mode).toBe("disabled");
    expect((policy as { invalid?: string }).invalid).toMatch(/COURSE_PREREQUISITES_ENFORCED_FROM/);
  });
  it("reads the process environment and falls back to disabled when it is malformed", () => {
    expect(prerequisitePolicyFromEnv({})).toEqual({ mode: "disabled" });
    expect(prerequisitePolicyFromEnv({ COURSE_PREREQUISITES_ENFORCED_FROM: "always" })).toEqual({ mode: "all" });
    expect(prerequisitePolicyFromEnv({ COURSE_PREREQUISITES_ENFORCED_FROM: "nonsense" }).mode).toBe("disabled");
  });
});

describe("unmetCoursePrerequisitesSql", () => {
  const course = Prisma.sql`c.id`; const learner = "11111111-1111-4111-8111-111111111111"; const lesson = Prisma.sql`cur.id`;
  const render = (sql: Prisma.Sql) => ({ text: sql.sql.replace(/\s+/g, " "), values: sql.values });
  it("is a constant empty list when disabled, so nothing can lock anyone", () => {
    expect(render(unmetCoursePrerequisitesSql(course, learner, { mode: "disabled" })).text).toBe("'[]'::jsonb");
  });
  it("ignores prerequisites that cannot be satisfied (unpublished, lesson-less, unreachable)", () => {
    const { text } = render(unmetCoursePrerequisitesSql(course, learner, { mode: "all" }));
    expect(text).toContain("pre.status = 'published'");
    expect(text).toContain("SELECT 1 FROM public.learning_lessons pl WHERE pl.course_id = pre.id");
    expect(text).toContain("learning_course_offerings po");
    expect(text).not.toContain("enrolled_at");
  });
  it("grandfathers learners enrolled before the cutoff using the server-side enrolment timestamp", () => {
    const cutoff = new Date("2026-12-01T00:00:00Z");
    const { text, values } = render(unmetCoursePrerequisitesSql(course, learner, { mode: "from", cutoff }));
    expect(text).toContain("ge.enrolled_at IS NULL OR ge.enrolled_at <");      // a missing timestamp counts as legacy, i.e. grandfathered
    expect(text).toContain("ge.status IN ('active', 'completed')");
    expect(values).toContainEqual(cutoff);
  });
  it("exempts a lesson the learner already completed, is working on, or has attempted", () => {
    const { text } = render(unmetCoursePrerequisitesSql(course, learner, { mode: "all" }, lesson));
    expect(text).toContain("started.status IN ('completed', 'in_progress')");
    expect(text).toContain("learning_assignment_attempts prior");
  });
  it("parses and words the result safely", () => {
    expect(parseUnmet([{ id: "a", title: "A" }, { id: 1 }, null, "x"])).toEqual([{ id: "a", title: "A" }]);
    expect(parseUnmet(undefined)).toEqual([]);
    expect(coursePrerequisiteMessage([{ id: "a", title: "A" }, { id: "b", title: "B" }])).toBe("Complete A and B first to unlock this course.");
  });
});
