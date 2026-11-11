import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * One transaction policy for every course-wide enrollment synchronization (publishing a course and the retry endpoint).
 * Both lock the course, every eligible classroom and per-learner progress rows, so they must share the same limits:
 *  - maxWait: how long to wait for a connection from the pool before the transaction even starts;
 *  - timeout: how long the whole all-or-nothing transaction may run. Prisma rolls back automatically when it is exceeded.
 * Prisma's default timeout is 5 s, far too short for a school with many classrooms.
 */
export const COURSE_SYNC_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type Client = { $transaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number }) => Promise<T> };

export type TransactionErrorKind = 'not-started-timeout' | 'expired-timeout' | 'unknown';

/**
 * Prisma raises P2028 ("Transaction API error") for several different reasons, and only some of them prove what happened:
 *  - "Unable to start a transaction in the given time" (maxWait): the transaction never started, so nothing was written;
 *  - "... expired transaction ... The timeout for this transaction was N ms": Prisma aborts and rolls back an expired
 *    interactive transaction, so its work is not committed;
 *  - anything else (closed/unknown transaction, a connection lost around the commit, ...): the outcome is NOT verified.
 * The message text is the only discriminator Prisma exposes, so anything not matching a known timeout is treated as unknown.
 */
export function classifyTransactionError(error: unknown): TransactionErrorKind | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2028') return null;
  const message = String(error.message);
  if (/unable to start a transaction in the given time/i.test(message)) return 'not-started-timeout';
  if (/expired transaction|timeout for this transaction was/i.test(message)) return 'expired-timeout';
  return 'unknown';
}

export const isTransactionTimeout = (error: unknown): boolean => {
  const kind = classifyTransactionError(error);
  return kind === 'not-started-timeout' || kind === 'expired-timeout';
};

const MESSAGES: Record<TransactionErrorKind, string> = {
  'not-started-timeout': 'Course enrollment synchronization could not start in time (the database was busy). Nothing was changed. Retry the request.',
  'expired-timeout': 'Course enrollment synchronization exceeded its time limit and the transaction was aborted and rolled back by the database client, so its changes were not committed. Retry the request; it is idempotent.',
  unknown: 'Course enrollment synchronization failed with a transaction error and its outcome could not be verified. Check the course status and its classroom enrollments before retrying.',
};

export async function runCourseSyncTransaction<T>(prisma: Client, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(work, COURSE_SYNC_TRANSACTION_OPTIONS);
  } catch (error) {
    const kind = classifyTransactionError(error);
    if (kind) throw new ServiceUnavailableException(MESSAGES[kind]);
    throw error;
  }
}
