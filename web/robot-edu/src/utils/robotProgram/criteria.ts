import type { Criterion } from '../../types/learning';
import type { ExecutionResult } from '../../types/robot';
import type { Problem, RobotProgram } from '../../types/robotProgram';
import { containsOp } from './generator';
import { zoneAt } from './kinematics';

export type CriterionState = 'met' | 'unmet' | 'pending' | 'manual';

export interface CriteriaContext {
  program: RobotProgram | null;
  problems: Problem[];
  lastRun: ExecutionResult | null;
}

export function evaluateCriterion(criterion: Criterion, ctx: CriteriaContext): CriterionState {
  const { check } = criterion;
  switch (check.kind) {
    case 'manual':
      return 'manual';
    case 'no_errors':
      if (!ctx.program) return 'pending';
      return ctx.problems.some((p) => p.severity === 'error') ? 'unmet' : 'met';
    case 'uses_op':
      if (!ctx.program) return 'pending';
      return containsOp(ctx.program.commands, check.op) ? 'met' : 'unmet';
    case 'run_completes':
      if (!ctx.lastRun) return 'pending';
      return ctx.lastRun.outcome === 'completed' ? 'met' : 'unmet';
    case 'object_in_zone':{
        if (!ctx.lastRun?.finalState || ctx.lastRun.outcome !== 'completed') return 'pending';
        const obj = ctx.lastRun.finalState.objects.find((o) => o.id === check.objectId);
        return obj && obj.heldBy === null && zoneAt(obj.x, obj.y) === check.zone ? 'met' : 'unmet';
      }
    default:
      return 'pending';
  }
}

export function describeCheck(criterion: Criterion): string {
  switch (criterion.check.kind) {
    case 'manual':
      return 'Reviewed by teacher';
    case 'no_errors':
      return 'Checked by validation';
    case 'uses_op':
      return 'Checked in program';
    case 'run_completes':
    case 'object_in_zone':
      return 'Checked after simulation';
    default:
      return '';
  }
}