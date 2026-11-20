import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/database/prisma.service";
import { AuthenticatedUser } from "../identity/auth/authenticated-user.interface";
import { LearningScopeService } from "./learning-scope.service";
import { SYMBOLIC_ACTIONS, SymbolicRuleCompilerError, SymbolicRuleCompilerService } from "./symbolic-rules/symbolic-rule-compiler.service";

/** Rules an instructor may combine. Each is validated by the same compiler that later grades submissions. */
export const AUTHORABLE_RULE_KEYS = ["action_present", "action_absent", "action_count", "ordered_actions", "arm_selected", "final_gripper_state", "home_action_present", "symbolic_duration", "preview_target_match", "object_grasped", "object_lifted", "object_released", "object_in_target_zone"] as const;

/** Blocks a student needs in the toolbox for a rule to be satisfiable at all (an unreachable challenge is refused at authoring time). */
const REQUIRED_BLOCKS: Record<string, string[]> = {
  symbolic_duration: ["wait"], preview_target_match: ["preview.move_xyz"], home_action_present: ["home"],
  object_grasped: ["gripper.close", "preview.move_xyz"], object_lifted: ["gripper.close", "preview.move_xyz"], object_released: ["gripper.open"], object_in_target_zone: ["preview.move_xyz"],
};
const ACTIONS_IN_CONFIG = (rule: { ruleKey: string; ruleConfig: Record<string, unknown> }): string[] => {
  if (["action_present", "action_count"].includes(rule.ruleKey)) return [String(rule.ruleConfig.action)];
  if (rule.ruleKey === "ordered_actions" && Array.isArray(rule.ruleConfig.actions)) return rule.ruleConfig.actions.map(String);
  return [];
};

export interface ChallengeInput {
  title?: string; description?: string; allowedBlocks?: string[];
  target?: { arm: "left" | "right"; x: number; y: number; z: number } | null;
  conditions?: Array<{ ruleKey: string; ruleConfig: Record<string, unknown>; description?: string }>;
}
interface ChallengeRow { id: string; title: string; description: string | null; status: string; organization_id: string | null; tabletop_config: { allowedBlocks?: string[]; target?: unknown } | null; created_at: Date; updated_at: Date }

/** Instructor/School Admin authoring of Blockly (symbolic-rule) challenges, scoped to the author's school. Global challenges stay System-Administrator-only. */
@Injectable()
export class ChallengeAuthoringService {
  constructor(private readonly prisma: PrismaService, private readonly scope: LearningScopeService, private readonly compiler: SymbolicRuleCompilerService) {}

  catalog() {
    return { blocks: [...SYMBOLIC_ACTIONS], rules: [...AUTHORABLE_RULE_KEYS], comparators: ["eq", "gte", "lte"], arms: ["left", "right"], gripperStates: ["open", "closed"] };
  }

  private authoringOrganization(user: AuthenticatedUser): string | null {
    if (this.scope.isSystemAdministrator(user)) return null;
    const organizationId = this.scope.authoringOrganizationIds(user)[0];
    if (!organizationId) throw new NotFoundException("Challenge was not found.");
    return organizationId;
  }

  private async owned(user: AuthenticatedUser, id: string): Promise<ChallengeRow> {
    const organizationId = this.authoringOrganization(user);
    const rows = await this.prisma.$queryRaw<ChallengeRow[]>`
      SELECT id, title, description, status, organization_id, tabletop_config, created_at, updated_at FROM public.learning_challenges
      WHERE id=${id}::uuid AND organization_id IS NOT DISTINCT FROM ${organizationId}::uuid LIMIT 1`;
    if (!rows[0] || !this.scope.canAuthorOrganization(user, rows[0].organization_id)) throw new NotFoundException("Challenge was not found.");
    return rows[0];
  }

  private validate(input: ChallengeInput, partial: boolean) {
    const out: { title?: string; description?: string; allowedBlocks?: string[]; target?: ChallengeInput["target"]; conditions?: NonNullable<ChallengeInput["conditions"]> } = {};
    if (!partial || input.title !== undefined) {
      const title = input.title?.trim();
      if (!title) throw new BadRequestException("A challenge title is required.");
      if (title.length > 160) throw new BadRequestException("The challenge title is too long.");
      out.title = title;
    }
    if (input.description !== undefined) { if (input.description.length > 2000) throw new BadRequestException("The description is too long."); out.description = input.description.trim(); }
    if (!partial || input.allowedBlocks !== undefined) {
      const blocks = [...new Set(input.allowedBlocks ?? [])];
      if (blocks.length === 0) throw new BadRequestException("Choose at least one block students may use.");
      const unknown = blocks.filter((block) => !(SYMBOLIC_ACTIONS as readonly string[]).includes(block));
      if (unknown.length) throw new BadRequestException(`Unknown block: ${unknown[0]}.`);
      out.allowedBlocks = blocks;
    }
    if (input.target !== undefined) {
      const t = input.target;
      if (t !== null && (!["left", "right"].includes(t.arm) || ![t.x, t.y, t.z].every((n) => Number.isInteger(n) && n >= 0 && n <= 1000))) throw new BadRequestException("The target needs an arm and whole-number x, y, z between 0 and 1000 mm.");
      out.target = t;
    }
    if (!partial || input.conditions !== undefined) {
      const conditions = input.conditions ?? [];
      if (conditions.length === 0) throw new BadRequestException("Add at least one success rule.");
      if (conditions.length > 10) throw new BadRequestException("A challenge may have at most 10 rules.");
      for (const [index, condition] of conditions.entries()) {
        if (!(AUTHORABLE_RULE_KEYS as readonly string[]).includes(condition.ruleKey)) throw new BadRequestException(`Rule ${index + 1}: unsupported rule "${condition.ruleKey}".`);
        try { this.compiler.compile([{ id: `r${index + 1}`, ordinal: index + 1, rule_key: condition.ruleKey, rule_config: condition.ruleConfig }]); }
        catch (error) { if (error instanceof SymbolicRuleCompilerError) throw new BadRequestException(`Rule ${index + 1}: ${error.message}`); throw error; }
      }
      out.conditions = conditions;
    }
    return out;
  }

  /** Cross-checks rules against the toolbox so a published challenge can always be completed, and derives the student-visible target from a preview_target_match rule. */
  private crossCheck(blocks: string[], conditions: NonNullable<ChallengeInput["conditions"]>, explicit: ChallengeInput["target"] | undefined): ChallengeInput["target"] | null {
    for (const [index, rule] of conditions.entries()) {
      const missing = [...(REQUIRED_BLOCKS[rule.ruleKey] ?? []), ...ACTIONS_IN_CONFIG(rule)].filter((block, i, all) => !blocks.includes(block) && all.indexOf(block) === i);
      if (missing.length) throw new BadRequestException(`Rule ${index + 1} cannot be completed: allow the ${missing.map((b) => `"${b}"`).join(", ")} block${missing.length > 1 ? "s" : ""}.`);
    }
    const targetRule = conditions.find((rule) => rule.ruleKey === "preview_target_match");
    if (targetRule) { const p = targetRule.ruleConfig.position as { x: number; y: number; z: number }; return { arm: targetRule.ruleConfig.arm as "left" | "right", x: p.x, y: p.y, z: p.z }; }
    return explicit ?? null;
  }

  private async replaceConditions(tx: Prisma.TransactionClient, challengeId: string, conditions: NonNullable<ChallengeInput["conditions"]>) {
    await tx.learning_challenge_conditions.deleteMany({ where: { challenge_id: challengeId } });
    for (const [index, c] of conditions.entries()) {
      await tx.learning_challenge_conditions.create({ data: { challenge_id: challengeId, condition_type: "success", rule_key: c.ruleKey, rule_config: c.ruleConfig as Prisma.InputJsonValue, description: c.description?.trim() || null, ordinal: index + 1 } });
    }
  }

  async list(user: AuthenticatedUser) {
    const organizationId = this.authoringOrganization(user);
    return this.prisma.$queryRaw`
      SELECT ch.id, ch.title, ch.description, ch.status, ch.updated_at AS "updatedAt", COALESCE(ch.tabletop_config->'allowedBlocks','[]'::jsonb) AS "allowedBlocks",
             (SELECT count(*)::int FROM public.learning_challenge_conditions cc WHERE cc.challenge_id=ch.id) AS "ruleCount",
             (SELECT count(*)::int FROM public.learning_assignments a WHERE a.challenge_id=ch.id) AS "assignmentCount"
      FROM public.learning_challenges ch WHERE ch.organization_id IS NOT DISTINCT FROM ${organizationId}::uuid ORDER BY ch.updated_at DESC`;
  }

  async get(user: AuthenticatedUser, id: string) {
    const row = await this.owned(user, id);
    const conditions = await this.prisma.learning_challenge_conditions.findMany({ where: { challenge_id: id }, orderBy: { ordinal: "asc" } });
    const used = await this.prisma.learning_assignments.count({ where: { challenge_id: id } });
    const cfg = row.tabletop_config ?? {};
    return { id: row.id, title: row.title, description: row.description ?? "", status: row.status, allowedBlocks: cfg.allowedBlocks ?? [], target: cfg.target ?? null, assignmentCount: used,
      conditions: conditions.map((c) => ({ ruleKey: c.rule_key, ruleConfig: c.rule_config, description: c.description ?? "" })) };
  }

  async create(user: AuthenticatedUser, input: ChallengeInput) {
    const organizationId = this.authoringOrganization(user);
    const v = this.validate(input, false);
    const derivedTarget = this.crossCheck(v.allowedBlocks!, v.conditions!, v.target);
    const id = await this.prisma.$transaction(async (tx) => {
      const created = await tx.learning_challenges.create({ data: { organization_id: organizationId, creator_user_id: user.vistaUserId, title: v.title!, description: v.description ?? "", success_criteria: { kind: "symbolic_rules" }, permitted_modes: ["blockly"], status: "draft", tabletop_config: { allowedBlocks: v.allowedBlocks!, target: derivedTarget } as Prisma.InputJsonValue } });
      await this.replaceConditions(tx, created.id, v.conditions!);
      return created.id;
    });
    return this.get(user, id);
  }

  async update(user: AuthenticatedUser, id: string, input: ChallengeInput) {
    const row = await this.owned(user, id);
    if (await this.prisma.learning_assignments.count({ where: { challenge_id: id } }) > 0) throw new ConflictException("This challenge is used by an assignment and can no longer be edited. Duplicate it instead.");
    const v = this.validate(input, true);
    const cfg = row.tabletop_config ?? {};
    const blocks = v.allowedBlocks ?? cfg.allowedBlocks ?? [];
    const currentConditions = v.conditions ?? (await this.prisma.learning_challenge_conditions.findMany({ where: { challenge_id: id }, orderBy: { ordinal: "asc" } })).map((c) => ({ ruleKey: c.rule_key, ruleConfig: c.rule_config as Record<string, unknown> }));
    const derivedTarget = this.crossCheck(blocks, currentConditions, v.target !== undefined ? v.target : (cfg.target as ChallengeInput["target"]) ?? null);
    await this.prisma.$transaction(async (tx) => {
      await tx.learning_challenges.update({ where: { id }, data: { ...(v.title ? { title: v.title } : {}), ...(v.description !== undefined ? { description: v.description } : {}), status: "draft",
        tabletop_config: { allowedBlocks: blocks, target: derivedTarget } as Prisma.InputJsonValue, updated_at: new Date() } });
      if (v.conditions) await this.replaceConditions(tx, id, v.conditions);
    });
    return this.get(user, id);
  }

  async publish(user: AuthenticatedUser, id: string) {
    await this.owned(user, id);
    if (!this.scope.canPublishOrganization(user, this.authoringOrganization(user))) throw new NotFoundException("Challenge was not found.");
    if (await this.prisma.learning_challenge_conditions.count({ where: { challenge_id: id, condition_type: "success" } }) === 0) throw new BadRequestException("Add at least one success rule before publishing.");
    await this.prisma.learning_challenges.update({ where: { id }, data: { status: "published", updated_at: new Date() } });
    return this.get(user, id);
  }

  /** published -> draft, only while no assignment uses the challenge. */
  async unpublish(user: AuthenticatedUser, id: string) {
    const row = await this.owned(user, id);
    if (!this.scope.canPublishOrganization(user, this.authoringOrganization(user))) throw new NotFoundException("Challenge was not found.");
    if (row.status !== "published") throw new ConflictException("Only a published challenge can be unpublished.");
    if (await this.prisma.learning_assignments.count({ where: { challenge_id: id } }) > 0) throw new ConflictException("This challenge is used by an assignment and stays published.");
    await this.prisma.learning_challenges.update({ where: { id }, data: { status: "draft", updated_at: new Date() } });
    return this.get(user, id);
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.owned(user, id);
    if (await this.prisma.learning_assignments.count({ where: { challenge_id: id } }) > 0) throw new ConflictException("This challenge is used by an assignment and cannot be deleted.");
    await this.prisma.learning_challenges.delete({ where: { id } });
    return { id, deleted: true };
  }
}
