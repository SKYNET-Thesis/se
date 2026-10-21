import { BadRequestException } from "@nestjs/common";
import { Comparator, NormalizedRuleSetV1, SymbolicAction } from "./symbolic-rule-compiler.service";

export interface SchematicOutputV1 { schemaVersion: 1; engineVersion: string; robotProgramVersionId: string; timeline: Array<Record<string, unknown>>; finalState: { selectedArm: "left" | "right" | null; grippers: Record<"left" | "right", "open" | "closed">; learningPreviewPosition?: { frame: "learning_preview_v1"; arm: "left" | "right"; x: number; y: number; z: number } | null }; warnings: string[]; }
export interface EvaluatedRule { ordinal: number; type: string; passed: boolean; expected: Record<string, unknown>; observed: Record<string, unknown>; evidence: Array<{ timelineIndex?: number }>; reason: string; }
export interface SymbolicEvaluationPreview { verdict: "passed" | "failed"; rules: EvaluatedRule[]; metrics: { ruleCount: number; passedRuleCount: number }; }

/** Pure in-memory preview only. It performs no persistence, routing or
 * authorization and is not the future historical evaluation aggregate. */
export class SymbolicRuleEvaluatorService {
  evaluate(ruleSet: NormalizedRuleSetV1, output: SchematicOutputV1): SymbolicEvaluationPreview {
    this.assertSupportedOutput(output); const rules = ruleSet.rules.map((rule) => this.evaluateRule(rule, output));
    return { verdict: rules.every((rule) => rule.passed) ? "passed" : "failed", rules, metrics: { ruleCount: rules.length, passedRuleCount: rules.filter((rule) => rule.passed).length } };
  }
  private evaluateRule(rule: NormalizedRuleSetV1["rules"][number], output: SchematicOutputV1): EvaluatedRule {
    const matches = (action: SymbolicAction) => output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === action);
    const compare = (actual: number, comparator: Comparator, expected: number) => comparator === "eq" ? actual === expected : comparator === "gte" ? actual >= expected : actual <= expected;
    if (rule.type === "action_present" || rule.type === "action_absent") { const evidence = matches(rule.action).map(({ index }) => ({ timelineIndex: index })); const passed = rule.type === "action_present" ? evidence.length > 0 : evidence.length === 0; return { ordinal: rule.ordinal, type: rule.type, passed, expected: { action: rule.action }, observed: { count: evidence.length }, evidence, reason: passed ? "action evidence matches rule" : "action evidence does not match rule" }; }
    if (rule.type === "action_count") { const evidence = matches(rule.action).map(({ index }) => ({ timelineIndex: index })); const passed = compare(evidence.length, rule.comparator, rule.count); return { ordinal: rule.ordinal, type: rule.type, passed, expected: { action: rule.action, comparator: rule.comparator, count: rule.count }, observed: { count: evidence.length }, evidence, reason: passed ? "action count matches rule" : "action count does not match rule" }; }
    if (rule.type === "ordered_actions") { let cursor = 0; const evidence: Array<{timelineIndex:number}> = []; for (const action of rule.actions) { const found = output.timeline.findIndex((event, index) => index >= cursor && event.type === action); if (found < 0) return { ordinal: rule.ordinal, type: rule.type, passed: false, expected: { actions: rule.actions, matching: "subsequence" }, observed: { matchedActions: evidence.length }, evidence, reason: "ordered subsequence is incomplete" }; evidence.push({ timelineIndex: found }); cursor = found + 1; } return { ordinal: rule.ordinal, type: rule.type, passed: true, expected: { actions: rule.actions, matching: "subsequence" }, observed: { matchedActions: evidence.length }, evidence, reason: "ordered subsequence matches" }; }
    if (rule.type === "arm_selected") { const evidence = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "arm.select" && event.selectedArm === rule.arm).map(({ index }) => ({ timelineIndex: index })); return { ordinal: rule.ordinal, type: rule.type, passed: evidence.length > 0, expected: { arm: rule.arm }, observed: { count: evidence.length }, evidence, reason: evidence.length ? "symbolic arm selection appears" : "symbolic arm selection is absent" }; }
    if (rule.type === "final_gripper_state") { const observed = output.finalState.grippers[rule.arm]; return { ordinal: rule.ordinal, type: rule.type, passed: observed === rule.state, expected: { arm: rule.arm, state: rule.state }, observed: { state: observed }, evidence: [], reason: observed === rule.state ? "final symbolic gripper state matches" : "final symbolic gripper state differs" }; }
    if (rule.type === "home_action_present") { const evidence = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "home" && event.arm === rule.arm && event.symbolic === "home").map(({ index }) => ({ timelineIndex: index })); return { ordinal: rule.ordinal, type: rule.type, passed: evidence.length > 0, expected: { arm: rule.arm }, observed: { count: evidence.length }, evidence, reason: evidence.length ? "symbolic home action appears" : "symbolic home action is absent" }; }
    if (rule.type === "preview_target_match") {
      const observed = output.finalState.learningPreviewPosition ?? null;
      const target = rule.position;
      const delta = observed ? { x: observed.x - target.x, y: observed.y - target.y, z: observed.z - target.z } : null;
      const passed = Boolean(observed && observed.frame === rule.frame && observed.arm === rule.arm && delta?.x === 0 && delta.y === 0 && delta.z === 0);
      const evidence = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "preview.move_xyz").map(({ index }) => ({ timelineIndex: index }));
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { frame: rule.frame, arm: rule.arm, position: target }, observed: { learningPreviewPosition: observed, delta }, evidence, reason: passed ? "learning preview target matches" : "learning preview target differs" };
    }
    const waits = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "wait" && Number.isInteger(event.durationMs)).map(({ event, index }) => ({ durationMs: event.durationMs as number, index })); const durationMs = waits.reduce((total, wait) => total + wait.durationMs, 0); const passed = compare(durationMs, rule.comparator, rule.durationMs); return { ordinal: rule.ordinal, type: rule.type, passed, expected: { comparator: rule.comparator, durationMs: rule.durationMs }, observed: { durationMs }, evidence: waits.map(({ index }) => ({ timelineIndex: index })), reason: passed ? "symbolic wait duration matches" : "symbolic wait duration does not match" };
  }
  /** Validates only the persisted v1 symbolic-engine representation. */
  assertSupportedOutput(output: unknown): asserts output is SchematicOutputV1 {
    const value = output as Partial<SchematicOutputV1> | null;
    if (!value || value.schemaVersion !== 1 || typeof value.engineVersion !== "string" || !value.engineVersion || typeof value.robotProgramVersionId !== "string" || !value.robotProgramVersionId || !Array.isArray(value.timeline) || !value.finalState || !value.finalState.grippers || !Array.isArray(value.warnings)) throw new BadRequestException("Persisted schematic output is not a supported v1 result.");
    if (value.finalState.selectedArm !== null && value.finalState.selectedArm !== "left" && value.finalState.selectedArm !== "right") throw new BadRequestException("Persisted schematic output has an invalid selected arm.");
    if (!["open", "closed"].includes(value.finalState.grippers.left) || !["open", "closed"].includes(value.finalState.grippers.right)) throw new BadRequestException("Persisted schematic output has invalid gripper state.");
    if (value.timeline.some((event) => !event || typeof event !== "object" || typeof event.type !== "string" || !Number.isInteger(event.index) || !Number.isInteger(event.atMs))) throw new BadRequestException("Persisted schematic output has an invalid timeline.");
  }
}
