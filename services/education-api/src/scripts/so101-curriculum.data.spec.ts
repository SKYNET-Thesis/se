import { QuestionBankService } from "../modules/learning/question-bank.service";
import { SO101_CURRICULUM } from "./so101-curriculum.data";

describe("SO-101 curriculum data pack", () => {
  const questions = SO101_CURRICULUM.flatMap((course) => course.quiz.questions);
  it("has the intended structure and a beginner → intermediate → advanced prerequisite chain", () => {
    expect(SO101_CURRICULUM.map((c) => c.level)).toEqual(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
    expect(SO101_CURRICULUM.map((c) => c.prerequisiteIndex)).toEqual([null, 0, 1]);
    expect(SO101_CURRICULUM.every((c) => c.lessons.length === 3 && c.quiz.questions.length === 10)).toBe(true);
    expect(SO101_CURRICULUM.every((c) => c.tags.includes("SO-101"))).toBe(true);
  });
  it("has unique codes and unique stems", () => {
    expect(new Set(questions.map((q) => q.code)).size).toBe(questions.length);
    expect(new Set(questions.map((q) => q.stem.toLowerCase())).size).toBe(questions.length);
  });
  it("has valid answer keys for every question type", () => {
    for (const q of questions) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(q.answer.every((a) => ids.includes(a))).toBe(true);
      if (q.type === "multiple_choice") { expect(q.answer.length).toBeGreaterThanOrEqual(2); expect(q.options.length).toBeGreaterThanOrEqual(4); }
      else expect(q.answer).toHaveLength(1);
      if (q.type === "true_false") expect(q.options).toHaveLength(2);
      expect(q.weight).toBeGreaterThan(0); expect(q.explanation.length).toBeGreaterThan(10);
    }
    // the multiple-choice questions must not be answerable by selecting everything
    expect(questions.filter((q) => q.type === "multiple_choice").every((q) => q.answer.length < q.options.length)).toBe(true);
  });
  it("links every question to a learning objective of its own course and covers every objective", () => {
    for (const course of SO101_CURRICULUM) {
      const objectives = new Set(course.lessons.flatMap((l) => l.objectives));
      for (const q of course.quiz.questions) expect(objectives.has(q.objective)).toBe(true);
      const covered = new Set(course.quiz.questions.map((q) => q.objective));
      const assignmentObjectives = course.assignment.objectives;
      expect(assignmentObjectives.every((o) => objectives.has(o))).toBe(true);
      expect([...objectives].filter((o) => !covered.has(o) && !assignmentObjectives.includes(o))).toEqual([]);
    }
  });
  it("applies the platform's academic rules to assignments and rubrics", () => {
    for (const course of SO101_CURRICULUM) {
      const a = course.assignment;
      expect(a.rubric.reduce((sum, r) => sum + r.maxPoints, 0)).toBe(100);
      expect(a.passScore).toBeLessThanOrEqual(100);
      if (a.type === "manual_final") expect(a.grading).toBe("manual");
    }
    expect(SO101_CURRICULUM[0].assignment).toMatchObject({ difficulty: "BEGINNER", type: "blockly", grading: "automatic" });
    expect(SO101_CURRICULUM[2].assignment).toMatchObject({ difficulty: "ADVANCED", type: "manual_final", grading: "manual" });
    // the beginner course needs no physical hardware
    expect(JSON.stringify(SO101_CURRICULUM[0]).toLowerCase()).not.toMatch(/robot lab|physical run is required/);
  });
  it("passes the Question Bank service's own content validation for every question (as published)", () => {
    const validate = (new QuestionBankService({} as never) as unknown as { validateContent: (c: unknown, publishing: boolean) => void }).validateContent.bind(new QuestionBankService({} as never));
    for (const q of questions) expect(() => validate({ type: q.type, difficulty: q.difficulty, cognitiveLevel: q.difficulty === "hard" ? "apply" : "remember", stem: q.stem, options: q.options, answerKey: q.answer, explanation: q.explanation }, true)).not.toThrow();
  });
});
