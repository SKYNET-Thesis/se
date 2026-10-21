import { createHash } from "crypto";

export const SYMBOLIC_ACTIONS = ["arm.select", "gripper.open", "gripper.close", "home", "wait", "preview.move_xyz"] as const;
export type SymbolicAction = typeof SYMBOLIC_ACTIONS[number];
export type Comparator = "eq" | "gte" | "lte";
export type Arm = "left" | "right";
export type GripperState = "open" | "closed";

export interface ChallengeConditionInput { id: string; ordinal: number; rule_key: string; rule_config: unknown; }
export interface RuleSource { conditionId: string; ordinal: number; }
export type SymbolicRule =
  | { ordinal: number; type: "action_present"; action: SymbolicAction }
  | { ordinal: number; type: "action_absent"; action: SymbolicAction }
  | { ordinal: number; type: "action_count"; action: SymbolicAction; comparator: Comparator; count: number }
  | { ordinal: number; type: "ordered_actions"; actions: SymbolicAction[]; matching: "subsequence" }
  | { ordinal: number; type: "arm_selected"; arm: Arm }
  | { ordinal: number; type: "final_gripper_state"; arm: Arm; state: GripperState }
  | { ordinal: number; type: "home_action_present"; arm: Arm }
  | { ordinal: number; type: "symbolic_duration"; comparator: Comparator; durationMs: number }
  | { ordinal: number; type: "preview_target_match"; frame: "learning_preview_v1"; arm: Arm; position: { x: number; y: number; z: number } };

export interface NormalizedRuleSetV1 {
  kind: "symbolic_rule_set";
  schemaVersion: 1;
  rules: SymbolicRule[];
  sources: RuleSource[];
  canonicalJson: string;
  ruleSetHash: string;
}

export type CompilerErrorCode = "UNKNOWN_RULE_KEY" | "INVALID_RULE_CONFIG" | "UNKNOWN_CONFIG_PROPERTY" | "INVALID_ACTION" | "INVALID_ARM" | "INVALID_COMPARATOR" | "INVALID_COUNT" | "EMPTY_SEQUENCE" | "DUPLICATE_ORDINAL";
export class SymbolicRuleCompilerError extends Error {
  constructor(readonly code: CompilerErrorCode, readonly conditionId: string, message: string) { super(message); }
}

/** Compiles only server-loaded challenge conditions. It is pure: no database,
 * HTTP, evaluator persistence, or learner-supplied rule input is accepted. */
export class SymbolicRuleCompilerService {
  compile(conditions: ChallengeConditionInput[]): NormalizedRuleSetV1 {
    const ordered = [...conditions].sort((a, b) => a.ordinal - b.ordinal || a.id.localeCompare(b.id));
    const seen = new Set<number>();
    const rules = ordered.map((condition) => {
      if (!Number.isInteger(condition.ordinal)) this.fail("INVALID_RULE_CONFIG", condition, "Condition ordinal must be an integer.");
      if (seen.has(condition.ordinal)) this.fail("DUPLICATE_ORDINAL", condition, "Rule condition ordinals must be unique.");
      seen.add(condition.ordinal);
      return this.compileOne(condition);
    });
    const semantic = { kind: "symbolic_rule_set" as const, schemaVersion: 1 as const, rules };
    const canonical = canonicalJson(semantic);
    return { ...semantic, sources: ordered.map(({ id, ordinal }) => ({ conditionId: id, ordinal })), canonicalJson: canonical, ruleSetHash: sha256(canonical) };
  }

  private compileOne(condition: ChallengeConditionInput): SymbolicRule {
    const config = this.config(condition);
    switch (condition.rule_key) {
      case "action_present": this.keys(condition, config, ["action"]); return { ordinal: condition.ordinal, type: "action_present", action: this.action(condition, config.action) };
      case "action_absent": this.keys(condition, config, ["action"]); return { ordinal: condition.ordinal, type: "action_absent", action: this.action(condition, config.action) };
      case "action_count": this.keys(condition, config, ["action", "comparator", "count"]); return { ordinal: condition.ordinal, type: "action_count", action: this.action(condition, config.action), comparator: this.comparator(condition, config.comparator), count: this.nonNegativeInt(condition, config.count, "count") };
      case "ordered_actions": {
        this.keys(condition, config, ["actions"]);
        if (!Array.isArray(config.actions) || config.actions.length === 0) this.fail("EMPTY_SEQUENCE", condition, "ordered_actions requires a non-empty actions array.");
        return { ordinal: condition.ordinal, type: "ordered_actions", actions: config.actions.map((value) => this.action(condition, value)), matching: "subsequence" };
      }
      case "arm_selected": this.keys(condition, config, ["arm"]); return { ordinal: condition.ordinal, type: "arm_selected", arm: this.arm(condition, config.arm) };
      case "final_gripper_state": this.keys(condition, config, ["arm", "state"]); return { ordinal: condition.ordinal, type: "final_gripper_state", arm: this.arm(condition, config.arm), state: this.state(condition, config.state) };
      case "home_action_present": this.keys(condition, config, ["arm"]); return { ordinal: condition.ordinal, type: "home_action_present", arm: this.arm(condition, config.arm) };
      case "symbolic_duration": this.keys(condition, config, ["comparator", "durationMs"]); return { ordinal: condition.ordinal, type: "symbolic_duration", comparator: this.comparator(condition, config.comparator), durationMs: this.nonNegativeInt(condition, config.durationMs, "durationMs") };
      case "preview_target_match": {
        this.keys(condition, config, ["frame", "arm", "position"]);
        const position = config.position as Record<string, unknown> | null;
        if (config.frame !== "learning_preview_v1" || !position || typeof position !== "object" || Array.isArray(position)) this.fail("INVALID_RULE_CONFIG", condition, "preview_target_match requires learning_preview_v1 and a position.");
        this.keys(condition, position, ["x", "y", "z"]);
        return { ordinal: condition.ordinal, type: "preview_target_match", frame: "learning_preview_v1", arm: this.arm(condition, config.arm), position: { x: this.nonNegativeInt(condition, position.x, "position.x"), y: this.nonNegativeInt(condition, position.y, "position.y"), z: this.nonNegativeInt(condition, position.z, "position.z") } };
      }
      default: this.fail("UNKNOWN_RULE_KEY", condition, `Unknown symbolic rule key '${condition.rule_key}'.`);
    }
  }

  private config(condition: ChallengeConditionInput): Record<string, unknown> {
    if (!condition.rule_config || typeof condition.rule_config !== "object" || Array.isArray(condition.rule_config)) this.fail("INVALID_RULE_CONFIG", condition, "Rule config must be an object.");
    return condition.rule_config as Record<string, unknown>;
  }
  private keys(condition: ChallengeConditionInput, config: Record<string, unknown>, allowed: string[]): void {
    for (const key of Object.keys(config)) if (!allowed.includes(key)) this.fail("UNKNOWN_CONFIG_PROPERTY", condition, `Unknown config property '${key}'.`);
    for (const key of allowed) if (!(key in config)) this.fail("INVALID_RULE_CONFIG", condition, `Missing required config property '${key}'.`);
  }
  private action(condition: ChallengeConditionInput, value: unknown): SymbolicAction { if (typeof value !== "string" || !(SYMBOLIC_ACTIONS as readonly string[]).includes(value)) this.fail("INVALID_ACTION", condition, "Action must be a canonical SchematicEngine action."); return value as SymbolicAction; }
  private arm(condition: ChallengeConditionInput, value: unknown): Arm { if (value !== "left" && value !== "right") this.fail("INVALID_ARM", condition, "Arm must be left or right."); return value; }
  private state(condition: ChallengeConditionInput, value: unknown): GripperState { if (value !== "open" && value !== "closed") this.fail("INVALID_RULE_CONFIG", condition, "Gripper state must be open or closed."); return value; }
  private comparator(condition: ChallengeConditionInput, value: unknown): Comparator { if (value !== "eq" && value !== "gte" && value !== "lte") this.fail("INVALID_COMPARATOR", condition, "Comparator must be eq, gte, or lte."); return value; }
  private nonNegativeInt(condition: ChallengeConditionInput, value: unknown, field: string): number { if (!Number.isInteger(value) || (value as number) < 0) this.fail("INVALID_COUNT", condition, `${field} must be a non-negative integer.`); return value as number; }
  private fail(code: CompilerErrorCode, condition: ChallengeConditionInput, message: string): never { throw new SymbolicRuleCompilerError(code, condition.id, message); }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") { const record = value as Record<string, unknown>; return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`; }
  throw new Error("Canonical JSON does not support undefined or non-JSON values.");
}
export function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
