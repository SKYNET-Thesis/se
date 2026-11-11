import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { classifyTransactionError, COURSE_SYNC_TRANSACTION_OPTIONS, isTransactionTimeout, runCourseSyncTransaction } from './course-sync-transaction';

const p2028 = (message: string) => new Prisma.PrismaClientKnownRequestError(message, { code: 'P2028', clientVersion: 'test' });
const EXPIRED = 'Transaction API error: Transaction already closed: A commit cannot be executed on an expired transaction. The timeout for this transaction was 30000 ms, however 30114 ms passed since the start of the transaction.';
const NOT_STARTED = 'Transaction API error: Unable to start a transaction in the given time.';
const UNKNOWN = 'Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn\'t have information about anymore, or was obtained before disconnecting.';

describe('course synchronization transaction policy', () => {
  it('uses an explicit wait and a 30 s timeout, not Prisma\'s 5 s default', () => {
    expect(COURSE_SYNC_TRANSACTION_OPTIONS).toEqual({ maxWait: 10_000, timeout: 30_000 });
  });

  it('passes exactly those options to the Prisma transaction and returns its result', async () => {
    const transaction = jest.fn(async (work: (tx: unknown) => unknown) => work('tx'));
    await expect(runCourseSyncTransaction({ $transaction: transaction } as never, async (tx) => ({ tx }))).resolves.toEqual({ tx: 'tx' });
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), COURSE_SYNC_TRANSACTION_OPTIONS);
  });

  const outcome = (error: unknown) => runCourseSyncTransaction({ $transaction: jest.fn().mockRejectedValue(error) } as never, async () => 1).catch((failure) => failure);

  it('classifies P2028 by what it proves: not started, expired, or unknown', () => {
    expect(classifyTransactionError(p2028(NOT_STARTED))).toBe('not-started-timeout');
    expect(classifyTransactionError(p2028(EXPIRED))).toBe('expired-timeout');
    expect(classifyTransactionError(p2028(UNKNOWN))).toBe('unknown');
    expect(classifyTransactionError(new Error('P2028'))).toBeNull();
    expect(isTransactionTimeout(p2028(EXPIRED))).toBe(true);
    expect(isTransactionTimeout(p2028(UNKNOWN))).toBe(false);
  });

  it('confirmed expiry: 503 saying the transaction was aborted and rolled back, retry is safe', async () => {
    const failure = await outcome(p2028(EXPIRED));
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(String(failure.message)).toMatch(/exceeded its time limit.*aborted and rolled back.*not committed.*Retry/);
  });

  it('confirmed not-started timeout: 503 saying nothing was changed', async () => {
    const failure = await outcome(p2028(NOT_STARTED));
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect(String(failure.message)).toMatch(/could not start in time.*Nothing was changed/);
  });

  it('unclassified P2028: 503 that does NOT claim a rollback and tells the client to verify state before retrying', async () => {
    const failure = await outcome(p2028(UNKNOWN));
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    const message = String(failure.message);
    expect(message).toMatch(/outcome could not be verified.*Check the course status and its classroom enrollments before retrying/);
    expect(message).not.toMatch(/rolled back|Nothing was changed|not committed|no course/i);
  });

  it('does not disguise other failures (business errors, deadlocks, constraint violations)', async () => {
    const other = new Prisma.PrismaClientKnownRequestError('deadlock', { code: 'P2010', clientVersion: 'test' });
    await expect(runCourseSyncTransaction({ $transaction: jest.fn().mockRejectedValue(other) } as never, async () => 1)).rejects.toBe(other);
    await expect(runCourseSyncTransaction({ $transaction: jest.fn().mockRejectedValue(new Error('boom')) } as never, async () => 1)).rejects.toThrow('boom');
  });
});
