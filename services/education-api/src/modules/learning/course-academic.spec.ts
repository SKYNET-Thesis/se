import { BadRequestException } from "@nestjs/common";
import { assertLevel, normalizeAssignmentAcademic, normalizeTags } from "./course-academic";

describe("course academic metadata", () => {
  it("accepts only the three structured levels", () => {
    expect(assertLevel("BEGINNER")).toBe("BEGINNER");
    for (const bad of ["beginner", "EXPERT", "", null, 3]) expect(() => assertLevel(bad)).toThrow(BadRequestException);
  });
  it("normalizes tags: trim, collapse spaces, case-insensitive de-duplication, caps and character rules", () => {
    expect(normalizeTags(["  SO-101 ", "so-101", "Robot   Kinematics", "", "Python"])).toEqual(["SO-101", "Robot Kinematics", "Python"]);
    expect(() => normalizeTags(Array.from({ length: 11 }, (_, i) => `t${i}`))).toThrow(/at most 10/);
    expect(() => normalizeTags(["x".repeat(33)])).toThrow(/32 characters/);
    expect(() => normalizeTags(["<script>"])).toThrow(/unsupported/);
    expect(() => normalizeTags("SO-101" as never)).toThrow(BadRequestException);
    expect(() => normalizeTags([5 as never])).toThrow(BadRequestException);
  });
  it("validates assignment classification and rejects automatic grading for manual finals and robot labs", () => {
    expect(normalizeAssignmentAcademic({ difficulty: "ADVANCED", assignmentType: "manual_final", gradingMethod: "manual", passScore: 60, learningObjectives: [" Explain forward kinematics ", ""] }))
      .toEqual({ difficulty: "ADVANCED", assignment_type: "manual_final", grading_method: "manual", pass_score: 60, learning_objectives: ["Explain forward kinematics"] });
    expect(() => normalizeAssignmentAcademic({ assignmentType: "manual_final", gradingMethod: "automatic" })).toThrow(/manual or mixed/);
    expect(() => normalizeAssignmentAcademic({ assignmentType: "robot_lab", gradingMethod: "automatic" })).toThrow(BadRequestException);
    expect(() => normalizeAssignmentAcademic({ difficulty: "HARD" })).toThrow(BadRequestException);
    expect(() => normalizeAssignmentAcademic({ assignmentType: "essay" })).toThrow(BadRequestException);
    expect(() => normalizeAssignmentAcademic({ passScore: -1 })).toThrow(BadRequestException);
    expect(normalizeAssignmentAcademic({ difficulty: null })).toEqual({ difficulty: null });
  });
});
