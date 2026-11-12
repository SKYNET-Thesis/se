import { ConflictException, NotFoundException } from '@nestjs/common';

/**
 * Shared attempt lifecycle rules for every student write bound to an attempt (program edits, submission, quiz
 * draft, attachments). Active enrollment is enforced separately by LearningScopeService.assertStudentClassroomAccess.
 */
export type AttemptState = {
  attempt_id: string;
  learner_user_id: string;
  attempt_status: string;
  program_id: string | null;
  classroom_assignment_id: string;
  classroom_id: string;
  assignment_id: string;
  assignment_constraints: unknown;
  delivery_status: string;
  available_from: Date | null;
  close_at: Date | null;
};

type Db = { $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T> };

export const ATTEMPT_NOT_IN_PROGRESS = 'ATTEMPT_NOT_IN_PROGRESS';
export const ASSIGNMENT_NOT_AVAILABLE = 'ASSIGNMENT_NOT_AVAILABLE';
export const ASSIGNMENT_CLOSED = 'ASSIGNMENT_CLOSED';

/** The caller's own attempt with its delivery window. `lock` takes the row lock that serializes writers. */
export async function loadOwnAttempt(db: Db, learnerUserId: string, attemptId: string, lock = false): Promise<AttemptState> {
  const rows = lock
    ? await db.$queryRaw<AttemptState[]>`
        SELECT a.id AS attempt_id,a.learner_user_id,a.status AS attempt_status,a.program_id,a.classroom_assignment_id,
          ca.classroom_id,ca.assignment_id,la.constraints AS assignment_constraints,ca.status AS delivery_status,ca.available_from,ca.close_at
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
        JOIN public.learning_assignments la ON la.id=ca.assignment_id
        WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${learnerUserId}::uuid FOR UPDATE OF a`
    : await db.$queryRaw<AttemptState[]>`
        SELECT a.id AS attempt_id,a.learner_user_id,a.status AS attempt_status,a.program_id,a.classroom_assignment_id,
          ca.classroom_id,ca.assignment_id,la.constraints AS assignment_constraints,ca.status AS delivery_status,ca.available_from,ca.close_at
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
        JOIN public.learning_assignments la ON la.id=ca.assignment_id
        WHERE a.id=${attemptId}::uuid AND a.learner_user_id=${learnerUserId}::uuid`;
  if (!rows[0]) throw new NotFoundException('Attempt was not found.');
  return rows[0];
}

/**
 * A student may change an attempt only while it is in progress AND its delivery is published, already available and not
 * closed. A passed due date alone does not block (late work stays possible until close_at, as in startAttempt).
 */
export function assertAttemptOpen(state: AttemptState, now: Date = new Date()): void {
  if (state.attempt_status !== 'in_progress') {
    throw new ConflictException({ code: ATTEMPT_NOT_IN_PROGRESS, message: 'This attempt is no longer open for changes.' });
  }
  if (state.delivery_status !== 'published' || (state.available_from && new Date(state.available_from) > now)) {
    throw new ConflictException({ code: ASSIGNMENT_NOT_AVAILABLE, message: 'This assignment is not available.' });
  }
  if (state.close_at && new Date(state.close_at) <= now) {
    throw new ConflictException({ code: ASSIGNMENT_CLOSED, message: 'This assignment is closed for submissions.' });
  }
}

export const assignmentKindOf = (constraints: unknown): string | null => {
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) return null;
  const kind = (constraints as { kind?: unknown }).kind;
  return typeof kind === 'string' ? kind : null;
};

/**
 * Attachments are opt-in per assignment: `constraints.attachments.enabled === true`. Auto-graded quizzes
 * (`knowledge_check`) and physical labs never accept files, whatever the constraints say.
 */
export function assignmentAcceptsAttachments(constraints: unknown): boolean {
  const kind = assignmentKindOf(constraints);
  if (kind === 'knowledge_check' || kind === 'physical_lab') return false;
  const attachments = constraints && typeof constraints === 'object' ? (constraints as { attachments?: unknown }).attachments : undefined;
  return Boolean(attachments && typeof attachments === 'object' && (attachments as { enabled?: unknown }).enabled === true);
}

/** The newest attempt of the caller that owns `programId` (a program belongs to exactly one attempt; legacy data may share). */
export async function loadOwnAttemptByProgram(db: Db, learnerUserId: string, programId: string, lock = false): Promise<AttemptState> {
  const rows = lock
    ? await db.$queryRaw<AttemptState[]>`
        SELECT a.id AS attempt_id,a.learner_user_id,a.status AS attempt_status,a.program_id,a.classroom_assignment_id,
          ca.classroom_id,ca.assignment_id,la.constraints AS assignment_constraints,ca.status AS delivery_status,ca.available_from,ca.close_at
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
        JOIN public.learning_assignments la ON la.id=ca.assignment_id
        WHERE a.program_id=${programId}::uuid AND a.learner_user_id=${learnerUserId}::uuid
        ORDER BY a.attempt_number DESC LIMIT 1 FOR UPDATE OF a`
    : await db.$queryRaw<AttemptState[]>`
        SELECT a.id AS attempt_id,a.learner_user_id,a.status AS attempt_status,a.program_id,a.classroom_assignment_id,
          ca.classroom_id,ca.assignment_id,la.constraints AS assignment_constraints,ca.status AS delivery_status,ca.available_from,ca.close_at
        FROM public.learning_assignment_attempts a
        JOIN public.learning_classroom_assignments ca ON ca.id=a.classroom_assignment_id
        JOIN public.learning_assignments la ON la.id=ca.assignment_id
        WHERE a.program_id=${programId}::uuid AND a.learner_user_id=${learnerUserId}::uuid
        ORDER BY a.attempt_number DESC LIMIT 1`;
  if (!rows[0]) throw new NotFoundException('Program was not found.');
  return rows[0];
}
