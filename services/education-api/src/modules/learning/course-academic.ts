import { BadRequestException } from "@nestjs/common";

/** Structured academic difficulty shared by courses and assignments (a course's level and an assignment's difficulty are independent). */
export const ACADEMIC_LEVELS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export type AcademicLevel = (typeof ACADEMIC_LEVELS)[number];
export const LEVEL_LABELS: Record<AcademicLevel, string> = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" };
export const LEVEL_LABEL_BY_CODE: Record<string, string> = LEVEL_LABELS;
export const ASSIGNMENT_TYPES = ["knowledge", "quiz", "blockly", "simulation", "robot_lab", "manual_final"] as const;
export const GRADING_METHODS = ["automatic", "manual", "mixed"] as const;
/** Suggested vocabulary shown to authors; any tag that passes validation is accepted and joins the "existing tags" list. */
export const SUGGESTED_TAGS = ["SO-101", "Robotics", "Blockly", "Python", "Robot Kinematics", "Simulation", "Computer Vision", "Robot Control"] as const;
export const MAX_TAGS = 10;
export const MAX_PREREQUISITES = 5;

export function assertLevel(value: unknown): AcademicLevel {
  if (typeof value !== "string" || !(ACADEMIC_LEVELS as readonly string[]).includes(value)) throw new BadRequestException("Level must be BEGINNER, INTERMEDIATE or ADVANCED.");
  return value as AcademicLevel;
}

/** Trim, collapse whitespace, reject empty/overlong/odd characters, de-duplicate case-insensitively (first spelling wins), cap the count. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) throw new BadRequestException("Tags must be a list.");
  const seen = new Map<string, string>();
  for (const raw of input) {
    if (typeof raw !== "string") throw new BadRequestException("Every tag must be text.");
    const tag = raw.replace(/\s+/g, " ").trim();
    if (!tag) continue;
    if (tag.length > 32) throw new BadRequestException(`Tag "${tag.slice(0, 20)}…" is longer than 32 characters.`);
    if (!/^[\p{L}\p{N}][\p{L}\p{N} .+#/_-]*$/u.test(tag)) throw new BadRequestException(`Tag "${tag}" contains unsupported characters.`);
    const key = tag.toLocaleLowerCase();
    if (!seen.has(key)) seen.set(key, tag);
  }
  if (seen.size > MAX_TAGS) throw new BadRequestException(`A course can have at most ${MAX_TAGS} tags.`);
  return [...seen.values()];
}

export interface AssignmentAcademicInput {
  difficulty?: string | null; assignmentType?: string | null; passScore?: number | null; gradingMethod?: string | null; learningObjectives?: string[];
}

export function normalizeAssignmentAcademic(input: AssignmentAcademicInput) {
  const out: { difficulty?: AcademicLevel | null; assignment_type?: string | null; pass_score?: number | null; grading_method?: string | null; learning_objectives?: string[] } = {};
  if (input.difficulty !== undefined) out.difficulty = input.difficulty === null ? null : assertLevel(input.difficulty);
  if (input.assignmentType !== undefined) {
    if (input.assignmentType !== null && !(ASSIGNMENT_TYPES as readonly string[]).includes(input.assignmentType)) throw new BadRequestException(`Assignment type must be one of ${ASSIGNMENT_TYPES.join(", ")}.`);
    out.assignment_type = input.assignmentType;
  }
  if (input.gradingMethod !== undefined) {
    if (input.gradingMethod !== null && !(GRADING_METHODS as readonly string[]).includes(input.gradingMethod)) throw new BadRequestException(`Grading method must be one of ${GRADING_METHODS.join(", ")}.`);
    out.grading_method = input.gradingMethod;
  }
  if (input.passScore !== undefined) {
    if (input.passScore !== null && (!Number.isFinite(input.passScore) || input.passScore < 0 || input.passScore > 100000)) throw new BadRequestException("Pass score must be a non-negative number.");
    out.pass_score = input.passScore;
  }
  if (input.learningObjectives !== undefined) {
    if (!Array.isArray(input.learningObjectives) || input.learningObjectives.length > 12) throw new BadRequestException("Provide up to 12 learning objectives.");
    const items = input.learningObjectives.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    if (items.some((item) => item.length > 300)) throw new BadRequestException("A learning objective is at most 300 characters.");
    out.learning_objectives = items;
  }
  // Rule: an ADVANCED manual final cannot claim fully automatic grading, and a robot lab/manual final needs a human grader.
  if ((out.assignment_type === "manual_final" || out.assignment_type === "robot_lab") && out.grading_method === "automatic") throw new BadRequestException("Manual finals and robot labs need manual or mixed grading.");
  return out;
}
