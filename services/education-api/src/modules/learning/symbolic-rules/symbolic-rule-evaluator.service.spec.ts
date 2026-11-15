import { SchematicEngineService } from "../schematic-engine.service";
import { SYMBOLIC_EVALUATOR_VERSION } from "./symbolic-evaluation-preparation.service";
import { SymbolicRuleCompilerService } from "./symbolic-rule-compiler.service";
import { SymbolicRuleEvaluatorService } from "./symbolic-rule-evaluator.service";

/**
 * Behavioural tests for the object-manipulation rules. They run the REAL schematic engine, rule compiler and evaluator end to
 * end (no mocks): a rule parameter (arm, minZ, objectId, zoneId) must be enforced against the engine evidence, not just echoed.
 */
const engine = new SchematicEngineService();
const compiler = new SymbolicRuleCompilerService();
const evaluator = new SymbolicRuleEvaluatorService();

type Step = Record<string, unknown>;
type Cond = { rule_key: string; rule_config: Record<string, unknown> };
const select = (arm: string): Step => ({ type: "arm.select", arm });
const move = (arm: string, x: number, y: number, z: number): Step => ({ type: "preview.move_xyz", arm, frame: "learning_preview_v1", mode: "learning_preview", position: { x, y, z } });
const close: Step = { type: "gripper.close" };
const open: Step = { type: "gripper.open" };
/** Cube at (120,150,0): approach (z 40), grasp, lift, open. */
const pick = (arm: string, liftZ = 100): Step[] => [select(arm), move(arm, 120, 150, 40), close, move(arm, 120, 150, liftZ), open];
/** Approach, grasp, lift, carry to (x,y) and release there. */
const carry = (arm: string, x: number, y: number): Step[] => [select(arm), move(arm, 120, 150, 40), close, move(arm, 120, 150, 100), move(arm, x, y, 100), move(arm, x, y, 20), open];
const zoneA = { zoneId: "A", label: "A", x: 60, y: 280, w: 120, h: 90 };
const zoneB = { zoneId: "B", label: "B", x: 400, y: 50, w: 120, h: 90 };

function run(steps: Step[], conds: Cond[], options?: Parameters<SchematicEngineService["render"]>[2]) {
  const output = engine.render({ kind: "robot_program", schemaVersion: 1, steps }, "pv-1", options);
  const ruleSet = compiler.compile(conds.map((c, i) => ({ id: `c${i}`, ordinal: i + 1, rule_key: c.rule_key, rule_config: c.rule_config })) as never);
  return { output, result: evaluator.evaluate(ruleSet, output as never) };
}
const rule = (steps: Step[], key: string, config: Record<string, unknown>, options?: Parameters<SchematicEngineService["render"]>[2]) => {
  const { output, result } = run(steps, [{ rule_key: key, rule_config: config }], options);
  return { output, rule: result.rules[0], verdict: result.verdict };
};

describe("SymbolicRuleEvaluatorService object rules", () => {
  it("identifies this evaluator revision (semantics changed from vista-symbolic-evaluator-1)", () => {
    expect(SYMBOLIC_EVALUATOR_VERSION).toBe("vista-symbolic-evaluator-2");
  });

  describe("arm", () => {
    it("passes when the required arm performed the grasp, with the grasp event as evidence", () => {
      const { output, rule: r } = rule(pick("left"), "object_grasped", { arm: "left" });
      expect(r).toMatchObject({ passed: true, code: "OBJECT_GRASPED", expected: { arm: "left" }, observed: { graspedByArms: ["left"] } });
      expect(r.evidence).toHaveLength(1);
      expect(output.timeline[r.evidence[0].timelineIndex!]).toMatchObject({ type: "gripper.close", arm: "left", grasped: true });
    });
    it("fails when the other arm grasped the object", () => {
      const { rule: r, verdict } = rule(pick("right"), "object_grasped", { arm: "left" });
      expect(verdict).toBe("failed");
      expect(r).toMatchObject({ passed: false, code: "OBJECT_GRASPED_BY_OTHER_ARM", observed: { wasGrasped: true, graspedByArms: ["right"] } });
      expect(r.message).toContain("requires the left arm");
    });
    it("a rule without an arm accepts either arm; arm=right accepts the right arm", () => {
      expect(rule(pick("right"), "object_grasped", {}).rule.passed).toBe(true);
      expect(rule(pick("left"), "object_grasped", {}).rule.passed).toBe(true);
      expect(rule(pick("right"), "object_grasped", { arm: "right" }).rule.passed).toBe(true);
    });
    it("a failed grasp attempt by the required arm does not count when the other arm succeeded", () => {
      const steps = [select("left"), close, ...pick("right")]; // left closes far from the cube (miss), right grasps
      expect(rule(steps, "object_grasped", { arm: "left" }).rule).toMatchObject({ passed: false, code: "OBJECT_GRASPED_BY_OTHER_ARM" });
      expect(rule(steps, "object_grasped", { arm: "right" }).rule.passed).toBe(true);
    });
    it("multiple operations: the rule is satisfied by every arm that really grasped", () => {
      const steps = [...pick("left"), ...pick("right")]; // left grasps and releases, then right grasps it
      expect(rule(steps, "object_grasped", { arm: "left" }).rule.passed).toBe(true);
      expect(rule(steps, "object_grasped", { arm: "right" }).rule.passed).toBe(true);
    });
    it("fails without a grasp at all, with the existing guidance codes", () => {
      expect(rule([select("left"), close], "object_grasped", { arm: "left" }).rule).toMatchObject({ passed: false, code: "GRASP_NOT_ESTABLISHED" });
      expect(rule([select("left")], "object_grasped", { arm: "left" }).rule).toMatchObject({ passed: false, code: "OBJECT_NOT_APPROACHED" });
    });
  });

  describe("minZ", () => {
    it("passes when the carry height reaches minZ (inclusive) and when minZ is below it", () => {
      expect(rule(pick("left", 100), "object_lifted", { minZ: 100 }).rule).toMatchObject({ passed: true, code: "OBJECT_LIFTED", observed: { maxCarryZ: 100 } });
      expect(rule(pick("left", 100), "object_lifted", { minZ: 70 }).rule.passed).toBe(true);
      expect(rule(pick("left", 100), "object_lifted", {}).rule.passed).toBe(true);
    });
    it("fails when the object only reached z=100 but minZ=200, reporting the observed height", () => {
      const { rule: r } = rule(pick("left", 100), "object_lifted", { minZ: 200 });
      expect(r).toMatchObject({ passed: false, code: "LIFT_HEIGHT_INSUFFICIENT", expected: { minZ: 200 }, observed: { wasLifted: true, maxCarryZ: 100 } });
      expect(r.message).toContain("z=200");
      expect(rule(pick("left", 100), "object_lifted", { minZ: 101 }).rule.code).toBe("LIFT_HEIGHT_INSUFFICIENT");
    });
    it("uses the highest carry height of several moves", () => {
      const steps = [select("left"), move("left", 120, 150, 40), close, move("left", 120, 150, 100), move("left", 120, 150, 180), move("left", 120, 150, 90), open];
      expect(rule(steps, "object_lifted", { minZ: 180 }).rule).toMatchObject({ passed: true, observed: { maxCarryZ: 180 } });
      expect(rule(steps, "object_lifted", { minZ: 181 }).rule.passed).toBe(false);
    });
    it("only counts heights reached while the object was held (the other arm rising does not help)", () => {
      const steps = [...pick("left", 100).slice(0, 4), select("right"), move("right", 300, 300, 250), select("left"), open];
      expect(rule(steps, "object_lifted", { minZ: 200 }).rule).toMatchObject({ passed: false, code: "LIFT_HEIGHT_INSUFFICIENT", observed: { maxCarryZ: 100 } });
    });
    it("keeps the engine's own lift threshold: an unlifted object never passes, whatever minZ says", () => {
      expect(rule(pick("left", 60), "object_lifted", { minZ: 10 }).rule).toMatchObject({ passed: false, code: "OBJECT_NOT_LIFTED" });
      expect(rule([select("left"), close], "object_lifted", {}).rule).toMatchObject({ passed: false, code: "OBJECT_NOT_GRASPED" });
    });
  });

  describe("objectId", () => {
    const rules: Array<[string, Record<string, unknown>]> = [["object_grasped", {}], ["object_lifted", {}], ["object_released", {}], ["object_in_target_zone", { zoneId: "A" }]];
    it.each(rules)("%s fails for an object that does not exist in the challenge", (key, config) => {
      const { rule: r, verdict } = rule(carry("left", 100, 320), key, { ...config, objectId: "cube-blue" });
      expect(verdict).toBe("failed");
      expect(r).toMatchObject({ passed: false, code: "OBJECT_NOT_FOUND", observed: { objectId: "cube-red" } });
    });
    it.each(rules)("%s passes when objectId names the simulated object", (key, config) => {
      expect(rule(carry("left", 100, 320), key, { ...config, objectId: "cube-red" }).rule.passed).toBe(true);
    });
    it("follows the challenge object, not a hard-coded default", () => {
      const options = { challengeObjects: [{ objectId: "cube-green", position: { x: 120, y: 150, z: 0 } }] };
      expect(rule(pick("left"), "object_grasped", { objectId: "cube-green" }, options).rule.passed).toBe(true);
      expect(rule(pick("left"), "object_grasped", { objectId: "cube-red" }, options).rule.code).toBe("OBJECT_NOT_FOUND");
    });
    it("multiple objects: only the first challenge object is simulated, so a rule on another one cannot pass", () => {
      const options = { challengeObjects: [{ objectId: "cube-green", position: { x: 120, y: 150, z: 0 } }, { objectId: "cube-blue", position: { x: 300, y: 150, z: 0 } }] };
      expect(rule(pick("left"), "object_grasped", { objectId: "cube-green" }, options).rule.passed).toBe(true);
      expect(rule(pick("left"), "object_grasped", { objectId: "cube-blue" }, options).rule.code).toBe("OBJECT_NOT_FOUND");
    });
  });

  describe("zoneId", () => {
    const zones = [zoneA, zoneB];
    it("passes for the destination zone the object was released in, resolving the zone geometry from the engine output", () => {
      const { output, rule: r } = rule(carry("left", 450, 90), "object_in_target_zone", { zoneId: "B" }, { targetZones: zones });
      expect(output.finalState.manipulation?.placedInZoneId).toBe("B");
      expect(r).toMatchObject({ passed: true, code: "OBJECT_PLACED_IN_TARGET_ZONE", expected: { zoneId: "B", bounds: { x: 400, y: 50, w: 120, h: 90 } }, observed: { placedInZoneId: "B", zoneId: "B" } });
    });
    it("fails when the object is released in a different zone", () => {
      const { output, rule: r } = rule(carry("left", 100, 320), "object_in_target_zone", { zoneId: "B" }, { targetZones: zones });
      expect(output.finalState.manipulation?.placedInZoneId).toBe("A");
      expect(r).toMatchObject({ passed: false, code: "OBJECT_RELEASED_OUTSIDE_TARGET", observed: { placedInZoneId: "A", placedInTargetZone: false } });
    });
    it("zone A keeps working (seed behaviour) and is the default when the rule names no zone", () => {
      expect(rule(carry("left", 100, 320), "object_in_target_zone", { zoneId: "A" }, { targetZones: zones }).rule.passed).toBe(true);
      expect(rule(carry("left", 100, 320), "object_in_target_zone", {}).rule.passed).toBe(true);
      expect(rule(carry("left", 450, 90), "object_in_target_zone", {}, { targetZones: zones }).rule.passed).toBe(false);
    });
    it("fails closed for a zone the challenge does not define", () => {
      expect(rule(carry("left", 100, 320), "object_in_target_zone", { zoneId: "C" }, { targetZones: zones }).rule).toMatchObject({ passed: false, code: "TARGET_ZONE_UNKNOWN" });
      expect(rule(carry("left", 450, 90), "object_in_target_zone", {}, { targetZones: [zoneB] }).rule.code).toBe("TARGET_ZONE_UNKNOWN"); // default "A" is not defined here
    });
    it("explicit rule bounds define the geometry", () => {
      const bounds = { x: 400, y: 50, w: 120, h: 90 };
      expect(rule(carry("left", 450, 90), "object_in_target_zone", { zoneId: "B", bounds }).rule.passed).toBe(true);
      expect(rule(carry("left", 100, 320), "object_in_target_zone", { zoneId: "B", bounds }).rule.code).toBe("OBJECT_RELEASED_OUTSIDE_TARGET");
    });
    it("keeps the guidance codes for programs that never grasp, lift or release", () => {
      expect(rule([select("left"), close], "object_in_target_zone", { zoneId: "A" }).rule.code).toBe("GRASP_NOT_ESTABLISHED");
      expect(rule([select("left"), move("left", 120, 150, 40), close, move("left", 100, 320, 40)], "object_in_target_zone", { zoneId: "A" }).rule.code).toBe("OBJECT_NOT_LIFTED");
      expect(rule([select("left"), move("left", 120, 150, 40), close, move("left", 100, 320, 100)], "object_in_target_zone", { zoneId: "A" }).rule.code).toBe("OBJECT_NOT_RELEASED");
    });
    it("historical outputs without recorded zones: legacy zone A still resolves, other zones fail closed", () => {
      const { output } = run(carry("left", 100, 320), []);
      const legacy = JSON.parse(JSON.stringify(output)); delete legacy.finalState.targetZones;
      const evaluate = (config: Record<string, unknown>) => evaluator.evaluate(compiler.compile([{ id: "c", ordinal: 1, rule_key: "object_in_target_zone", rule_config: config }] as never), legacy).rules[0];
      expect(evaluate({ zoneId: "A" }).passed).toBe(true);
      expect(evaluate({ zoneId: "B" }).code).toBe("TARGET_ZONE_UNKNOWN");
    });
  });

  describe("combined rules (Course 1 L3 / L4 rule sets)", () => {
    const l3: Cond[] = [
      { rule_key: "ordered_actions", rule_config: { actions: ["preview.move_xyz", "gripper.close", "preview.move_xyz", "gripper.open"] } },
      { rule_key: "object_grasped", rule_config: { arm: "left" } },
      { rule_key: "object_lifted", rule_config: { minZ: 70 } },
      { rule_key: "object_released", rule_config: {} },
      { rule_key: "final_gripper_state", rule_config: { arm: "left", state: "open" } },
    ];
    const l4: Cond[] = [...l3, { rule_key: "object_in_target_zone", rule_config: { objectId: "cube-red", zoneId: "A" } }];
    it("the correct left-arm solutions still PASS every rule", () => {
      expect(run(pick("left"), l3).result).toMatchObject({ verdict: "passed", metrics: { ruleCount: 5, passedRuleCount: 5 } });
      expect(run(carry("left", 100, 320), l4, { targetZones: [zoneA] }).result).toMatchObject({ verdict: "passed", metrics: { ruleCount: 6, passedRuleCount: 6 } });
    });
    it("the same task solved with the right arm now FAILS exactly the arm rule, with evidence", () => {
      const { result } = run(pick("right"), l3);
      expect(result.verdict).toBe("failed");
      expect(result.metrics).toEqual({ ruleCount: 5, passedRuleCount: 4 });
      expect(result.rules.filter((r) => !r.passed).map((r) => r.code)).toEqual(["OBJECT_GRASPED_BY_OTHER_ARM"]);
    });
    it("evaluation is deterministic (same input, identical result)", () => {
      const a = run(carry("left", 100, 320), l4, { targetZones: [zoneA] }).result;
      const b = run(carry("left", 100, 320), l4, { targetZones: [zoneA] }).result;
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});
