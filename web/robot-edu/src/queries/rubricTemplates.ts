/**
 * The four rubric templates of VISTA_Assessment_Rubrics.docx (v0.1; weights approved 2026-11-28 as CONFIGURABLE DEFAULTS, not immutable).
 * A template only pre-fills the editable criteria: weight w becomes `maxPoints = 4 x w`, so level L later scores `L x w` with no extra grading contract.
 */
export interface RubricTemplateCriterion { title: string; weight: number; descriptors: [string, string, string, string]; }
export interface RubricTemplate { id: 'blockly' | 'simulation' | 'robot_lab' | 'manual_final'; label: string; criteria: RubricTemplateCriterion[]; }

export const RUBRIC_TEMPLATES: RubricTemplate[] = [
  { id: 'blockly', label: 'Blockly programming', criteria: [
    { title: "Program correctness", weight: 3, descriptors: ["All required logic works", "Most required logic works; minor defect", "Some required logic works", "Major logic errors"] },
    { title: "Task completion", weight: 2, descriptors: ["All required outputs achieved", "Most outputs achieved", "Some outputs achieved", "Minimal output achieved"] },
    { title: "Program structure", weight: 1, descriptors: ["Clear, reusable blocks and sequence", "Mostly clear structure", "Repetition or confusing sequence", "Disorganized blocks"] },
    { title: "Validation and debugging", weight: 2, descriptors: ["Tests normal and edge cases; explains fixes", "Tests main cases and fixes issues", "Limited tests or explanation", "Little validation"] },
    { title: "Submission evidence", weight: 1, descriptors: ["Complete, traceable program and results", "Minor evidence omissions", "Partial evidence", "Evidence difficult to verify"] },
  ] },
  { id: 'simulation', label: 'Simulation assignment', criteria: [
    { title: "Task outcome", weight: 3, descriptors: ["All target conditions verified", "Most target conditions verified", "Some target conditions verified", "Minimal target achievement"] },
    { title: "Trajectory and control", weight: 2, descriptors: ["Stable, accurate motion within limits", "Minor deviations within limits", "Repeated deviations within limits", "Poor control or incomplete motion"] },
    { title: "Safety compliance", weight: 2, descriptors: ["All applicable checks demonstrated", "Minor documentation gaps; checks met", "Some checks not demonstrated", "Major safety requirements not demonstrated"] },
    { title: "Runtime evidence", weight: 2, descriptors: ["Traceable run and matching telemetry", "Traceable run with minor omissions", "Partial run evidence", "Evidence weak or mismatched"] },
    { title: "Analysis and reflection", weight: 1, descriptors: ["Explains results and limitations accurately", "Mostly accurate explanation", "Partial explanation", "Minimal explanation"] },
  ] },
  { id: 'robot_lab', label: 'Physical robot assignment', criteria: [
    { title: "Task outcome", weight: 3, descriptors: ["All authorized physical targets verified", "Most targets verified", "Some targets verified", "Minimal target achievement"] },
    { title: "Setup and calibration", weight: 2, descriptors: ["Connection and calibration verified", "Minor setup documentation gaps", "Partial calibration evidence", "Setup poorly demonstrated"] },
    { title: "Motion quality", weight: 2, descriptors: ["Controlled motion within approved limits", "Minor deviations within limits", "Repeated deviations within limits", "Poor or incomplete motion"] },
    { title: "Safety procedure", weight: 3, descriptors: ["All required supervised safety checks verified", "Checks met; minor documentation gaps", "Some required checks not demonstrated", "Major safety requirements not demonstrated"] },
    { title: "Physical evidence", weight: 2, descriptors: ["Verified physical identity and traceable run", "Verified physical run with minor omissions", "Partial physical evidence", "Evidence weak or mismatched"] },
  ] },
  { id: 'manual_final', label: 'Final assessment', criteria: [
    { title: "Technical correctness", weight: 3, descriptors: ["All required concepts and logic correct", "Mostly correct; minor errors", "Partly correct", "Major errors"] },
    { title: "Problem solving", weight: 3, descriptors: ["Complete solution with justified decisions", "Mostly complete and justified", "Partial solution", "Minimal solution"] },
    { title: "Validation and evidence", weight: 2, descriptors: ["Complete reproducible validation", "Mostly reproducible validation", "Partial validation", "Weak validation"] },
    { title: "Explanation and reflection", weight: 2, descriptors: ["Clear reasoning and limitations", "Mostly clear reasoning", "Partial reasoning", "Minimal reasoning"] },
  ] },
];

/** Editor rows (maxPoints as text, as the editor keeps them) for a template; the instructor may edit every field afterwards. */
export function templateRows(template: RubricTemplate) {
  return template.criteria.map((c) => ({ title: c.title, description: '', maxPoints: String(4 * c.weight), descriptors: [...c.descriptors] as string[] }));
}
export const LEVEL_LABELS = ['Not demonstrated', 'Beginning', 'Developing', 'Good', 'Excellent'] as const;
/** points = level x (max / 4); level 0 is an explicit zero. */
export const pointsForLevel = (level: number, maxPoints: number | string) => (level * Number(maxPoints)) / 4;
/** Level that produced `points`, when it is exactly one of 0..4; null for free direct points. */
export function levelOf(points: number | string | null | undefined, maxPoints: number | string): number | null {
  if (points === null || points === undefined || points === '') return null;
  const ratio = (Number(points) * 4) / Number(maxPoints);
  return Number.isInteger(ratio) && ratio >= 0 && ratio <= 4 ? ratio : null;
}
