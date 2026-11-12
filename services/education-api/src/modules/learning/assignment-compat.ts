import { BadRequestException } from '@nestjs/common';
import { SYMBOLIC_ACTIONS } from './symbolic-rules/symbolic-rule-compiler.service';

/**
 * Assignment templates (`learning_assignments`) are told apart by `constraints.kind`:
 *  - `knowledge_check`  quiz template (Question Bank or legacy quiz)
 *  - `symbolic_program` Blockly programming template (also what Course Builder authors)
 *  - `physical_lab`     physical-execution template (never authored here)
 *  - absent / other     teacher-created classroom assignments (no curriculum contract)
 * `challenge_id` is optional for every kind, so it is never part of this contract.
 */
export const PROGRAMMING_KIND = 'symbolic_program';
export const QUIZ_KIND = 'knowledge_check';
const PHYSICAL_KIND = 'physical_lab';

/** The runtime's own registry of symbolic actions: the only blocks a programming assignment may allow (no duplicated list). */
export const PROGRAMMING_BLOCKS = SYMBOLIC_ACTIONS;

/** Activity types whose learner evidence is a symbolic program submission (see ActivityProgressService). */
const PROGRAM_ACTIVITY_TYPES = new Set(['guided_practice', 'simulation', 'challenge']);

export function assignmentKind(constraints: unknown): string | null {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) return null;
  const kind = (constraints as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : null;
}

/** Throws when an assignment template cannot back an activity of `type`. Types without a mapping are left alone. */
export function assertAssignmentMatchesActivityType(type: string, constraints: unknown): void {
  const kind = assignmentKind(constraints);
  if (type === 'knowledge_check') {
    if (kind !== QUIZ_KIND) throw new BadRequestException('A Quiz activity must reference a quiz assignment.');
  } else if (PROGRAM_ACTIVITY_TYPES.has(type)) {
    if (kind === QUIZ_KIND) throw new BadRequestException('A programming activity cannot reference a quiz assignment.');
    if (kind === PHYSICAL_KIND) throw new BadRequestException('A programming activity cannot reference a physical-lab assignment.');
  }
}

export type ProgrammingAssignmentInput = { title: string; instructions: string; allowedBlocks: string[] };

export function validProgrammingAssignment(input: ProgrammingAssignmentInput): ProgrammingAssignmentInput {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200) throw new BadRequestException('Assignment title is invalid.');
  const instructions = typeof input.instructions === 'string' ? input.instructions.trim() : '';
  if (instructions.length > 10_000) throw new BadRequestException('Assignment instructions are too long.');
  const blocks = input.allowedBlocks;
  const allowed = new Set<string>(PROGRAMMING_BLOCKS);
  if (!Array.isArray(blocks) || !blocks.length || new Set(blocks).size !== blocks.length || blocks.some((block) => !allowed.has(block))) {
    throw new BadRequestException('Allowed blocks must be a non-empty list of supported, unique blocks.');
  }
  return { title, instructions, allowedBlocks: [...blocks] };
}
