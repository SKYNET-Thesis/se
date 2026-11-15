import { BadRequestException } from "@nestjs/common";
import { Comparator, NormalizedRuleSetV1, SymbolicAction } from "./symbolic-rule-compiler.service";

export interface SchematicOutputV1 {
  schemaVersion: 1;
  engineVersion: string;
  robotProgramVersionId: string;
  timeline: Array<Record<string, unknown>>;
  finalState: {
    selectedArm: "left" | "right" | null;
    grippers: Record<"left" | "right", "open" | "closed">;
    learningPreviewPosition?: { frame: "learning_preview_v1"; arm: "left" | "right"; x: number; y: number; z: number } | null;
    objectState?: {
      objectId: string;
      position: { x: number; y: number; z: number };
      graspedBy: "left" | "right" | null;
      state: "free" | "grasped" | "carried" | "released";
    };
    manipulation?: {
      wasGrasped: boolean;
      wasLifted: boolean;
      wasReleased: boolean;
      graspAttempts: number;
      successfulGrasps: number;
      releasePosition: { x: number; y: number; z: number } | null;
      placedInZoneId?: string | null;
      targetZoneDistance?: number | null;
    };
    targetZones?: Array<{
      zoneId: string;
      label?: string;
      x: number;
      y: number;
      w: number;
      h: number;
    }>;
  };
  warnings: string[];
}
export interface EvaluatedRule { ordinal: number; type: string; passed: boolean; expected: Record<string, unknown>; observed: Record<string, unknown>; evidence: Array<{ timelineIndex?: number }>; reason: string; code?: string; message?: string; }
type ObjectRule = Extract<NormalizedRuleSetV1["rules"][number], { type: "object_grasped" | "object_lifted" | "object_released" | "object_in_target_zone" }>;
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
    if (rule.type === "action_present" || rule.type === "action_absent") {
      const evidence = matches(rule.action).map(({ index }) => ({ timelineIndex: index }));
      const passed = rule.type === "action_present" ? evidence.length > 0 : evidence.length === 0;
      const code = passed ? (rule.type === "action_present" ? "ACTION_PRESENT" : "ACTION_ABSENT") : (rule.type === "action_present" ? "ACTION_MISSING" : "DISALLOWED_ACTION_FOUND");
      const message = passed ? (rule.type === "action_present" ? `Action '${rule.action}' found.` : `Disallowed action '${rule.action}' was avoided.`) : (rule.type === "action_present" ? `Required action '${rule.action}' is missing.` : `Disallowed action '${rule.action}' found.`);
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { action: rule.action }, observed: { count: evidence.length }, evidence, reason: passed ? "action evidence matches rule" : "action evidence does not match rule", code, message };
    }
    if (rule.type === "action_count") {
      const evidence = matches(rule.action).map(({ index }) => ({ timelineIndex: index }));
      const passed = compare(evidence.length, rule.comparator, rule.count);
      const code = passed ? "ACTION_COUNT_MATCH" : "ACTION_COUNT_MISMATCH";
      const message = passed ? `Action count for '${rule.action}' matches.` : `Action count for '${rule.action}' does not meet requirement.`;
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { action: rule.action, comparator: rule.comparator, count: rule.count }, observed: { count: evidence.length }, evidence, reason: passed ? "action count matches rule" : "action count does not match rule", code, message };
    }
    if (rule.type === "ordered_actions") {
      let cursor = 0; const evidence: Array<{timelineIndex:number}> = [];
      const isManipulation = rule.actions.includes("gripper.close");
      for (const action of rule.actions) {
        const found = output.timeline.findIndex((event, index) => index >= cursor && event.type === action);
        if (found < 0) {
          return {
            ordinal: rule.ordinal,
            type: rule.type,
            passed: false,
            expected: { actions: rule.actions, matching: "subsequence" },
            observed: { matchedActions: evidence.length },
            evidence,
            reason: "ordered subsequence is incomplete",
            code: isManipulation ? "SEQUENCE_INCOMPLETE" : "ORDERED_ACTIONS_INCOMPLETE",
            message: isManipulation
              ? "Complete the grasp, lift, and release sequence in order."
              : "Actions must appear in the required sequence: Home → Move to Position → Wait.",
          };
        }
        evidence.push({ timelineIndex: found }); cursor = found + 1;
      }
      return { ordinal: rule.ordinal, type: rule.type, passed: true, expected: { actions: rule.actions, matching: "subsequence" }, observed: { matchedActions: evidence.length }, evidence, reason: "ordered subsequence matches", code: "ORDERED_ACTIONS_MATCH", message: "Required actions executed in the correct sequence." };
    }
    if (rule.type === "arm_selected") {
      const evidence = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "arm.select" && event.selectedArm === rule.arm).map(({ index }) => ({ timelineIndex: index }));
      const passed = evidence.length > 0;
      const code = passed ? "ARM_SELECTED" : "ARM_NOT_SELECTED";
      const message = passed ? `Selected ${rule.arm} arm.` : `Select the ${rule.arm} arm before moving.`;
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { arm: rule.arm }, observed: { count: evidence.length }, evidence, reason: evidence.length ? "symbolic arm selection appears" : "symbolic arm selection is absent", code, message };
    }
    if (rule.type === "final_gripper_state") {
      const observed = output.finalState.grippers[rule.arm];
      const passed = observed === rule.state;
      const code = passed ? "GRIPPER_STATE_MATCH" : "GRIPPER_FINAL_STATE_INVALID";
      const message = passed
        ? `Final gripper state is ${rule.state}.`
        : `Finish the task with the gripper ${rule.state}.`;
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { arm: rule.arm, state: rule.state }, observed: { state: observed }, evidence: [], reason: passed ? "final symbolic gripper state matches" : "final symbolic gripper state differs", code, message };
    }
    if (rule.type === "home_action_present") {
      const evidence = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "home" && event.arm === rule.arm && event.symbolic === "home").map(({ index }) => ({ timelineIndex: index }));
      const passed = evidence.length > 0;
      const code = passed ? "HOME_ACTION_PRESENT" : "HOME_ACTION_MISSING";
      const message = passed ? "Home action executed." : "The program must start by homing the robot.";
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { arm: rule.arm }, observed: { count: evidence.length }, evidence, reason: passed ? "symbolic home action appears" : "symbolic home action is absent", code, message };
    }
    if (rule.type === "preview_target_match") {
      const observed = output.finalState.learningPreviewPosition ?? null;
      const target = rule.position;
      const delta = observed ? { x: observed.x - target.x, y: observed.y - target.y, z: observed.z - target.z } : null;
      const passed = Boolean(observed && observed.frame === rule.frame && observed.arm === rule.arm && delta?.x === 0 && delta.y === 0 && delta.z === 0);
      const evidence = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "preview.move_xyz").map(({ index }) => ({ timelineIndex: index }));
      const code = passed ? "PREVIEW_TARGET_MATCH" : "PREVIEW_TARGET_MISMATCH";
      const message = passed
        ? "The robot reached Target A successfully."
        : observed
          ? `The robot reached position (${observed.x}, ${observed.y}, ${observed.z}) instead of Target A (${target.x}, ${target.y}, ${target.z}).`
          : "The robot did not reach Target A.";
      return { ordinal: rule.ordinal, type: rule.type, passed, expected: { frame: rule.frame, arm: rule.arm, position: target }, observed: { learningPreviewPosition: observed, delta }, evidence, reason: passed ? "learning preview target matches" : "learning preview target differs", code, message };
    }
    if (rule.type === "object_grasped" || rule.type === "object_lifted" || rule.type === "object_released" || rule.type === "object_in_target_zone") {
      return this.evaluateObjectRule(rule, output);
    }
    const waits = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "wait" && Number.isInteger(event.durationMs)).map(({ event, index }) => ({ durationMs: event.durationMs as number, index }));
    const durationMs = waits.reduce((total, wait) => total + wait.durationMs, 0);
    const passed = compare(durationMs, rule.comparator, rule.durationMs);
    const code = passed ? "WAIT_DURATION_MATCH" : "WAIT_DURATION_MISMATCH";
    const message = passed ? `Wait duration was sufficient (${durationMs}ms).` : `Wait duration must be at least ${rule.durationMs}ms (observed ${durationMs}ms).`;
    return { ordinal: rule.ordinal, type: rule.type, passed, expected: { comparator: rule.comparator, durationMs: rule.durationMs }, observed: { durationMs }, evidence: waits.map(({ index }) => ({ timelineIndex: index })), reason: passed ? "symbolic wait duration matches" : "symbolic wait duration does not match", code, message };
  }
  /**
   * Object-manipulation rules. Every rule parameter is enforced against the persisted engine evidence (timeline + finalState)
   * and is never merely echoed into `expected`:
   *  - `arm`      the arm that performed the successful grasp (a `gripper.close` event with `grasped: true`);
   *  - `minZ`     the highest tool height reached while that arm held the object (`preview.move_xyz` events), in
   *               learning_preview_v1 millimetres. It can only tighten the engine's own lift threshold, never relax it;
   *  - `objectId` the object the engine actually simulated: a rule naming any other object FAILS (OBJECT_NOT_FOUND);
   *  - `zoneId`   resolved to the challenge's target zone geometry recorded in the persisted output (`finalState.targetZones`),
   *               unless the rule carries explicit `bounds`. An unknown zone FAILS (TARGET_ZONE_UNKNOWN).
   * Rules that omit a parameter keep their previous meaning (any arm / the simulated object / zone "A").
   */
  private evaluateObjectRule(rule: ObjectRule, output: SchematicOutputV1): EvaluatedRule {
    const manip = output.finalState.manipulation;
    const objState = output.finalState.objectState;
    const actualObjectId = objState?.objectId ?? null;
    const expectedObjectId = rule.objectId ?? "cube-red";
    const events = output.timeline.map((event, index) => ({ event, index }));
    const indexes = (list: typeof events) => list.map(({ index }) => ({ timelineIndex: index }));
    const releaseEvidence = indexes(events.filter(({ event }) => event.released === true));
    const wasGrasped = Boolean(manip?.wasGrasped);
    const heldMoves = events.filter(({ event }) => event.type === "preview.move_xyz"
      && (event.objectState as { graspedBy?: string | null } | undefined)?.graspedBy === event.arm
      && Number.isFinite((event.position as { z?: number } | undefined)?.z));
    const maxCarryZ = heldMoves.length ? Math.max(...heldMoves.map(({ event }) => (event.position as { z: number }).z)) : null;

    let zoneId: string | undefined; let zone: { x: number; y: number; w: number; h: number } | null = null;
    if (rule.type === "object_in_target_zone") {
      zoneId = rule.zoneId ?? "A";
      if (rule.bounds) zone = rule.bounds;
      else {
        const zones = output.finalState.targetZones;
        const found = zones?.find((candidate) => candidate.zoneId === zoneId);
        if (found) zone = { x: found.x, y: found.y, w: found.w, h: found.h };
        else if (!zones && zoneId === "A") zone = { x: 60, y: 280, w: 120, h: 90 }; // outputs persisted before zones were recorded
      }
    }
    const expected: Record<string, unknown> = rule.type === "object_grasped" ? { arm: rule.arm ?? "any", objectId: expectedObjectId }
      : rule.type === "object_lifted" ? { minZ: rule.minZ ?? 70, objectId: expectedObjectId }
      : rule.type === "object_released" ? { state: "released", objectId: expectedObjectId }
      : { zoneId, bounds: zone, objectId: expectedObjectId };
    const fail = (observed: Record<string, unknown>, reason: string, code: string, message: string, evidence: Array<{ timelineIndex?: number }> = []): EvaluatedRule =>
      ({ ordinal: rule.ordinal, type: rule.type, passed: false, expected, observed, evidence, reason, code, message });

    if (rule.objectId !== undefined && rule.objectId !== actualObjectId) {
      return fail({ objectId: actualObjectId }, `rule references object '${rule.objectId}' but the simulated object is '${actualObjectId ?? "none"}'`, "OBJECT_NOT_FOUND", `Object '${rule.objectId}' is not part of this challenge.`);
    }

    if (rule.type === "object_grasped") {
      const graspEvents = events.filter(({ event }) => event.type === "gripper.close" && event.grasped === true);
      const graspedByArms = [...new Set(graspEvents.map(({ event }) => event.arm))];
      const byRequiredArm = rule.arm ? graspEvents.filter(({ event }) => event.arm === rule.arm) : graspEvents;
      const passed = wasGrasped && byRequiredArm.length > 0;
      const attempts = manip?.graspAttempts ?? 0;
      const observed = { wasGrasped, graspAttempts: attempts, graspedByArms };
      if (passed) return { ordinal: rule.ordinal, type: rule.type, passed, expected, observed, evidence: indexes(byRequiredArm), reason: "object grasp established", code: "OBJECT_GRASPED", message: "The object was successfully grasped." };
      if (wasGrasped) return fail(observed, `object was grasped by the ${graspedByArms.join("/")} arm, not the required ${rule.arm} arm`, "OBJECT_GRASPED_BY_OTHER_ARM", `The object was grasped with the ${graspedByArms.join("/")} arm, but this task requires the ${rule.arm} arm.`, indexes(graspEvents));
      return attempts > 0
        ? fail(observed, "gripper closed outside grasp threshold", "GRASP_NOT_ESTABLISHED", "The gripper closed, but the object was not grasped. Move closer to the object before closing the gripper.", indexes(graspEvents))
        : fail(observed, "gripper did not close on object", "OBJECT_NOT_APPROACHED", "Move the gripper closer to the object before closing it.", indexes(graspEvents));
    }

    if (rule.type === "object_lifted") {
      const wasLifted = Boolean(manip?.wasLifted);
      const highEnough = rule.minZ === undefined || (maxCarryZ !== null && maxCarryZ >= rule.minZ);
      const observed = { wasLifted, wasGrasped, maxCarryZ };
      const carried = indexes(events.filter(({ event }) => (event.objectState as { state?: string } | undefined)?.state === "carried"));
      if (wasLifted && highEnough) return { ordinal: rule.ordinal, type: rule.type, passed: true, expected, observed, evidence: carried, reason: "object was lifted above minimum clearance height", code: "OBJECT_LIFTED", message: "The object was lifted after being grasped." };
      if (!wasGrasped) return fail(observed, "cannot lift ungrasped object", "OBJECT_NOT_GRASPED", "Grasp the object before attempting to lift it.", carried);
      if (!wasLifted) return fail(observed, "object remained at or below grasp height", "OBJECT_NOT_LIFTED", "The object was grasped but was not lifted.", carried);
      return fail(observed, `object was carried to z=${maxCarryZ} but the rule requires at least z=${rule.minZ}`, "LIFT_HEIGHT_INSUFFICIENT", `Lift the object to at least z=${rule.minZ}; the highest carry height was z=${maxCarryZ}.`, carried);
    }

    if (rule.type === "object_released") {
      const passed = Boolean(manip?.wasReleased);
      return { ordinal: rule.ordinal, type: rule.type, passed, expected, observed: { wasReleased: passed }, evidence: releaseEvidence,
        reason: passed ? "object was released from gripper" : "object was not released", code: passed ? "OBJECT_RELEASED" : "OBJECT_NOT_RELEASED",
        message: passed ? "The object was released." : "Open the gripper to release the object." };
    }

    // object_in_target_zone
    const releasePos = manip?.releasePosition ?? (objState?.state === "released" ? objState.position : null);
    if (!zone) {
      return fail({ placedInTargetZone: false, placedInZoneId: manip?.placedInZoneId ?? null }, `target zone '${zoneId}' is not defined by the challenge`, "TARGET_ZONE_UNKNOWN", `Target zone '${zoneId}' is not defined for this challenge.`);
    }
    if (!wasGrasped) {
      const attempts = manip?.graspAttempts ?? 0;
      return fail({ wasGrasped: false, placedInTargetZone: false }, "object was never grasped", attempts > 0 ? "GRASP_NOT_ESTABLISHED" : "OBJECT_NEVER_GRASPED",
        attempts > 0 ? "The gripper closed, but the object was not grasped." : "Move closer to the object and close the gripper before moving to the target zone.");
    }
    if (!manip?.wasLifted) return fail({ wasGrasped: true, wasLifted: false, placedInTargetZone: false }, "object was not lifted before transfer", "OBJECT_NOT_LIFTED", "Lift the object before moving toward the target.");
    if (!manip?.wasReleased || objState?.state !== "released" || !releasePos) {
      return fail({ wasGrasped: true, wasLifted: true, wasReleased: Boolean(manip?.wasReleased), placedInTargetZone: false }, "object was not released in target zone", "OBJECT_NOT_RELEASED", "Open the gripper to place the object.");
    }
    const inside = releasePos.x >= zone.x && releasePos.x <= zone.x + zone.w && releasePos.y >= zone.y && releasePos.y <= zone.y + zone.h;
    if (inside) {
      return { ordinal: rule.ordinal, type: rule.type, passed: true, expected, observed: { releasePosition: releasePos, placedInTargetZone: true, zoneId, placedInZoneId: manip?.placedInZoneId ?? null }, evidence: releaseEvidence,
        reason: `Object released inside target zone at (${releasePos.x}, ${releasePos.y}, ${releasePos.z}).`, code: "OBJECT_PLACED_IN_TARGET_ZONE", message: "The object was successfully placed inside the target zone." };
    }
    const dx = Math.max(0, zone.x - releasePos.x, releasePos.x - (zone.x + zone.w));
    const dy = Math.max(0, zone.y - releasePos.y, releasePos.y - (zone.y + zone.h));
    const dist = Math.round(Math.hypot(dx, dy));
    return fail({ releasePosition: releasePos, placedInTargetZone: false, targetZoneDistance: dist, placedInZoneId: manip?.placedInZoneId ?? null },
      `The object was released ${dist} mm outside the target area. Move the object farther into the target area before opening the gripper.`, "OBJECT_RELEASED_OUTSIDE_TARGET", "The object was released outside the target zone.", releaseEvidence);
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
