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
    if (rule.type === "object_grasped") {
      const manip = output.finalState.manipulation;
      const passed = Boolean(manip?.wasGrasped);
      const evidence = output.timeline
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.grasped === true)
        .map(({ index }) => ({ timelineIndex: index }));
      const code = passed
        ? "OBJECT_GRASPED"
        : (manip?.graspAttempts ?? 0) > 0
          ? "GRASP_NOT_ESTABLISHED"
          : "OBJECT_NOT_APPROACHED";
      const message = passed
        ? "The object was successfully grasped."
        : (manip?.graspAttempts ?? 0) > 0
          ? "The gripper closed, but the object was not grasped. Move closer to the object before closing the gripper."
          : "Move the gripper closer to the object before closing it.";
      return {
        ordinal: rule.ordinal,
        type: rule.type,
        passed,
        expected: { arm: rule.arm ?? "any", objectId: rule.objectId ?? "cube-red" },
        observed: { wasGrasped: passed, graspAttempts: manip?.graspAttempts ?? 0 },
        evidence,
        reason: passed
          ? "object grasp established"
          : (manip?.graspAttempts ?? 0) > 0
            ? "gripper closed outside grasp threshold"
            : "gripper did not close on object",
        code,
        message,
      };
    }
    if (rule.type === "object_lifted") {
      const manip = output.finalState.manipulation;
      const passed = Boolean(manip?.wasLifted);
      const minZ = rule.minZ ?? 70;
      const evidence = output.timeline
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => {
          const objState = event.objectState as { state?: string } | undefined;
          return objState?.state === "carried";
        })
        .map(({ index }) => ({ timelineIndex: index }));
      const code = passed
        ? "OBJECT_LIFTED"
        : !manip?.wasGrasped
          ? "OBJECT_NOT_GRASPED"
          : "OBJECT_NOT_LIFTED";
      const message = passed
        ? "The object was lifted after being grasped."
        : !manip?.wasGrasped
          ? "Grasp the object before attempting to lift it."
          : "The object was grasped but was not lifted.";
      return {
        ordinal: rule.ordinal,
        type: rule.type,
        passed,
        expected: { minZ, objectId: rule.objectId ?? "cube-red" },
        observed: { wasLifted: passed, wasGrasped: Boolean(manip?.wasGrasped) },
        evidence,
        reason: passed
          ? "object was lifted above minimum clearance height"
          : !manip?.wasGrasped
            ? "cannot lift ungrasped object"
            : "object remained at or below grasp height",
        code,
        message,
      };
    }
    if (rule.type === "object_released") {
      const manip = output.finalState.manipulation;
      const passed = Boolean(manip?.wasReleased);
      const evidence = output.timeline
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.released === true)
        .map(({ index }) => ({ timelineIndex: index }));
      const code = passed ? "OBJECT_RELEASED" : "OBJECT_NOT_RELEASED";
      const message = passed
        ? "The object was released."
        : "Open the gripper to release the object.";
      return {
        ordinal: rule.ordinal,
        type: rule.type,
        passed,
        expected: { state: "released", objectId: rule.objectId ?? "cube-red" },
        observed: { wasReleased: passed },
        evidence,
        reason: passed ? "object was released from gripper" : "object was not released",
        code,
        message,
      };
    }
    if (rule.type === "object_in_target_zone") {
      const manip = output.finalState.manipulation;
      const objState = output.finalState.objectState;
      const zoneId = rule.zoneId ?? "A";
      const bounds = rule.bounds ?? { x: 60, y: 280, w: 120, h: 90 };
      const releasePos = manip?.releasePosition ?? (objState?.state === "released" ? objState.position : null);

      if (!manip?.wasGrasped) {
        return {
          ordinal: rule.ordinal,
          type: rule.type,
          passed: false,
          expected: { zoneId, bounds, objectId: rule.objectId ?? "cube-red" },
          observed: { wasGrasped: false, placedInTargetZone: false },
          evidence: [],
          reason: "object was never grasped",
          code: (manip?.graspAttempts ?? 0) > 0 ? "GRASP_NOT_ESTABLISHED" : "OBJECT_NEVER_GRASPED",
          message: (manip?.graspAttempts ?? 0) > 0
            ? "The gripper closed, but the object was not grasped."
            : "Move closer to the object and close the gripper before moving to the target zone.",
        };
      }

      if (!manip?.wasLifted) {
        return {
          ordinal: rule.ordinal,
          type: rule.type,
          passed: false,
          expected: { zoneId, bounds, objectId: rule.objectId ?? "cube-red" },
          observed: { wasGrasped: true, wasLifted: false, placedInTargetZone: false },
          evidence: [],
          reason: "object was not lifted before transfer",
          code: "OBJECT_NOT_LIFTED",
          message: "Lift the object before moving toward the target.",
        };
      }

      if (!manip?.wasReleased || objState?.state !== "released" || !releasePos) {
        return {
          ordinal: rule.ordinal,
          type: rule.type,
          passed: false,
          expected: { zoneId, bounds, objectId: rule.objectId ?? "cube-red" },
          observed: { wasGrasped: true, wasLifted: true, wasReleased: Boolean(manip?.wasReleased), placedInTargetZone: false },
          evidence: [],
          reason: "object was not released in target zone",
          code: "OBJECT_NOT_RELEASED",
          message: "Open the gripper to place the object.",
        };
      }

      const inside =
        releasePos.x >= bounds.x &&
        releasePos.x <= bounds.x + bounds.w &&
        releasePos.y >= bounds.y &&
        releasePos.y <= bounds.y + bounds.h;

      const evidence = output.timeline
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.released === true)
        .map(({ index }) => ({ timelineIndex: index }));

      if (inside) {
        return {
          ordinal: rule.ordinal,
          type: rule.type,
          passed: true,
          expected: { zoneId, bounds, objectId: rule.objectId ?? "cube-red" },
          observed: { releasePosition: releasePos, placedInTargetZone: true, zoneId },
          evidence,
          reason: `Object released inside target zone at (${releasePos.x}, ${releasePos.y}, ${releasePos.z}).`,
          code: "OBJECT_PLACED_IN_TARGET_ZONE",
          message: "The object was successfully placed inside the target zone.",
        };
      }

      const dx = Math.max(0, bounds.x - releasePos.x, releasePos.x - (bounds.x + bounds.w));
      const dy = Math.max(0, bounds.y - releasePos.y, releasePos.y - (bounds.y + bounds.h));
      const dist = Math.round(Math.hypot(dx, dy));

      return {
        ordinal: rule.ordinal,
        type: rule.type,
        passed: false,
        expected: { zoneId, bounds, objectId: rule.objectId ?? "cube-red" },
        observed: { releasePosition: releasePos, placedInTargetZone: false, targetZoneDistance: dist },
        evidence,
        reason: `The object was released ${dist} mm outside the target area. Move the object farther into the target area before opening the gripper.`,
        code: "OBJECT_RELEASED_OUTSIDE_TARGET",
        message: "The object was released outside the target zone.",
      };
    }
    const waits = output.timeline.map((event, index) => ({ event, index })).filter(({ event }) => event.type === "wait" && Number.isInteger(event.durationMs)).map(({ event, index }) => ({ durationMs: event.durationMs as number, index }));
    const durationMs = waits.reduce((total, wait) => total + wait.durationMs, 0);
    const passed = compare(durationMs, rule.comparator, rule.durationMs);
    const code = passed ? "WAIT_DURATION_MATCH" : "WAIT_DURATION_MISMATCH";
    const message = passed ? `Wait duration was sufficient (${durationMs}ms).` : `Wait duration must be at least ${rule.durationMs}ms (observed ${durationMs}ms).`;
    return { ordinal: rule.ordinal, type: rule.type, passed, expected: { comparator: rule.comparator, durationMs: rule.durationMs }, observed: { durationMs }, evidence: waits.map(({ index }) => ({ timelineIndex: index })), reason: passed ? "symbolic wait duration matches" : "symbolic wait duration does not match", code, message };
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
