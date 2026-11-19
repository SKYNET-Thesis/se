import { QuestionBankService } from "../modules/learning/question-bank.service";
import { SYMBOLIC_ACTIONS, SymbolicRuleCompilerService } from "../modules/learning/symbolic-rules/symbolic-rule-compiler.service";
import { SO101_CURRICULUM } from "./so101-curriculum.data";

const modules = SO101_CURRICULUM.flatMap((course) => course.modules.map((module) => ({ course, module })));
const questions = modules.flatMap(({ module }) => module.quiz.questions);
const objectivesOf = (module: (typeof modules)[number]["module"]) => new Set(module.lessons.flatMap((lesson) => lesson.objectives));
const assignmentsAndLabs = SO101_CURRICULUM.flatMap((course) => [...course.assignments, ...course.labs]);

describe("SO-101 curriculum data pack (initial target)", () => {
  it("meets the approved target counts and the beginner → intermediate → advanced prerequisite chain", () => {
    expect(SO101_CURRICULUM.map((c) => c.level)).toEqual(["BEGINNER", "INTERMEDIATE", "ADVANCED"]);
    expect(SO101_CURRICULUM.map((c) => c.prerequisiteIndex)).toEqual([null, 0, 1]);
    expect(modules).toHaveLength(9);                                                   // 9 module-end quizzes
    expect(modules.reduce((n, { module }) => n + module.lessons.length, 0)).toBe(18); // 18 lessons
    expect(questions).toHaveLength(180);                                               // 180 questions
    expect(SO101_CURRICULUM.reduce((n, c) => n + c.assignments.length, 0)).toBe(6);    // 6 assignments
    expect(SO101_CURRICULUM.reduce((n, c) => n + c.labs.length, 0)).toBe(6);           // 6 practical labs
    expect(SO101_CURRICULUM.every((c) => c.tags.includes("SO-101"))).toBe(true);
  });
  it("has unique codes and unique stems (no duplicated questions)", () => {
    expect(new Set(questions.map((q) => q.code)).size).toBe(180);
    expect(new Set(questions.map((q) => q.stem.toLowerCase().replace(/\s+/g, " "))).size).toBe(180);
    expect(questions.every((q) => q.stem.length >= 15 && q.explanation.length >= 12)).toBe(true);
  });
  it("has valid answer keys, sensible type mix and no guessable multiple-choice", () => {
    for (const q of questions) {
      const ids = q.options.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(q.answer.every((a) => ids.includes(a))).toBe(true);
      expect(new Set(q.options.map((o) => o.text.toLowerCase())).size).toBe(q.options.length); // no duplicated options
      if (q.type === "multiple_choice") { expect(q.answer.length).toBeGreaterThanOrEqual(2); expect(q.answer.length).toBeLessThan(q.options.length); }
      else expect(q.answer).toHaveLength(1);
      if (q.type === "true_false") expect(q.options.map((o) => o.id)).toEqual(["true", "false"]);
      else expect(q.options.length).toBeGreaterThanOrEqual(4);
    }
    const types = new Set(questions.map((q) => q.type));
    expect(types).toEqual(new Set(["single_choice", "multiple_choice", "true_false"]));
    // every module quiz uses weights and each difficulty
    for (const { module } of modules) { expect(new Set(module.quiz.questions.map((q) => q.weight)).size).toBeGreaterThanOrEqual(2); expect(module.quiz.questions.some((q) => q.type === "multiple_choice")).toBe(true); }
  });
  it("covers every learning objective of every module and links each question to an objective of its own module", () => {
    for (const { module } of modules) {
      const objectives = objectivesOf(module);
      expect(objectives.size).toBe(4);
      for (const q of module.quiz.questions) expect(objectives.has(q.objective)).toBe(true);
      const covered = new Set(module.quiz.questions.map((q) => q.objective));
      expect([...objectives].filter((o) => !covered.has(o))).toEqual([]);
    }
  });
  it("has real lesson explanations", () => {
    for (const { module } of modules) for (const lesson of module.lessons) {
      const text = lesson.blocks.filter((b) => b.type === "paragraph").map((b) => b.text).join(" ");
      expect(lesson.blocks.filter((b) => b.type === "paragraph").length).toBeGreaterThanOrEqual(3);
      expect(text.length).toBeGreaterThan(300);
      expect(lesson.instructorGuidance.length).toBeGreaterThan(30);
    }
  });
  it("applies the platform's academic rules to assignments, labs and rubrics", () => {
    for (const a of assignmentsAndLabs) {
      expect(a.rubric.reduce((sum, r) => sum + r.maxPoints, 0)).toBe(100);
      expect(a.passScore).toBeLessThanOrEqual(100);
      expect(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).toContain(a.difficulty);
      if (a.type === "manual_final") expect(a.grading).toBe("manual");
    }
    expect(SO101_CURRICULUM.map((c) => c.assignments.every((a) => a.difficulty === c.level))).toEqual([true, true, true]);
    expect(SO101_CURRICULUM[0].labs.every((l) => l.type === "blockly" && l.grading === "automatic")).toBe(true);          // beginner labs: Blockly-only, automatic
    expect(SO101_CURRICULUM[1].labs.concat(SO101_CURRICULUM[2].labs).every((l) => l.type === "simulation")).toBe(true);  // higher levels: simulation fallback, no hardware
    expect(SO101_CURRICULUM[2].assignments.every((a) => a.type === "manual_final")).toBe(true);                           // advanced: manual final assessment
    expect(JSON.stringify(SO101_CURRICULUM[0]).toLowerCase()).not.toMatch(/\brobot lab\b|physical run is required|you need a physical robot/);
  });
  it("gives every lab a compilable symbolic challenge and only allowed Blockly blocks (beginner labs without movement)", () => {
    const compiler = new SymbolicRuleCompilerService();
    for (const course of SO101_CURRICULUM) for (const lab of course.labs) {
      expect(lab.challenge.allowedBlocks.every((b) => (SYMBOLIC_ACTIONS as readonly string[]).includes(b))).toBe(true);
      expect(() => compiler.compile(lab.challenge.conditions.map((c, i) => ({ id: `${lab.title}-${i}`, ordinal: i + 1, rule_key: c.ruleKey, rule_config: c.ruleConfig } as never)))).not.toThrow();
      if (course.level === "BEGINNER") expect(lab.challenge.allowedBlocks).not.toContain("preview.move_xyz");
      else expect(lab.challenge.allowedBlocks).toContain("preview.move_xyz");
    }
  });
  it("passes the Question Bank service's own content validation for every question (as published)", () => {
    const validate = (new QuestionBankService({} as never) as unknown as { validateContent: (c: unknown, publishing: boolean) => void }).validateContent.bind(new QuestionBankService({} as never));
    for (const q of questions) expect(() => validate({ type: q.type, difficulty: q.difficulty, cognitiveLevel: q.difficulty === "hard" ? "apply" : "remember", stem: q.stem, options: q.options, answerKey: q.answer, explanation: q.explanation }, true)).not.toThrow();
  });
});
