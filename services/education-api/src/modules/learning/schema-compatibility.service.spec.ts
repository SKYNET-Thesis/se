import { ServiceUnavailableException } from '@nestjs/common';
import { SchemaCompatibilityService } from './schema-compatibility.service';
import { ProgrammingService } from './programming.service';

const build = (...answers: Array<{ stage1: boolean; stage2: boolean }>) => {
  const queryRaw = jest.fn();
  answers.forEach((a) => queryRaw.mockResolvedValueOnce([a]));
  return { service: new SchemaCompatibilityService({ $queryRaw: queryRaw } as never), queryRaw };
};

describe('SchemaCompatibilityService', () => {
  it('refuses to start against a database without Stage 1 (never silently degrades)', async () => {
    await expect(build({ stage1: false, stage2: false }).service.onModuleInit()).rejects.toThrow(/Stage 1\) is not applied/);
  });
  it('starts on Stage 1 and answers 503 for Stage-2-only endpoints until Stage 2 exists', async () => {
    const t = build({ stage1: true, stage2: false });
    await expect(t.service.onModuleInit()).resolves.toBeUndefined();
    await expect(t.service.requireStage2()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('re-reads a negative answer after the recheck interval and caches a positive one', async () => {
    const t = build({ stage1: true, stage2: false }, { stage1: true, stage2: true });
    await t.service.onModuleInit();
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
    await expect(t.service.requireStage2()).resolves.toBeUndefined();
    await expect(t.service.requireStage2()).resolves.toBeUndefined();
    expect(t.queryRaw).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
  });
  it('treats an unreadable result as incompatible', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    await expect(new SchemaCompatibilityService({ $queryRaw: queryRaw } as never).onModuleInit()).rejects.toThrow();
  });
});

describe('Stage 2 dependent endpoints fail before touching the database on a Stage 1-only schema', () => {
  it('final submit answers 503 without opening a transaction', async () => {
    const compat = { requireStage2: jest.fn().mockRejectedValue(new ServiceUnavailableException('Stage 2 not applied')) };
    const transaction = jest.fn();
    const service = new ProgrammingService({ $transaction: transaction } as never, {} as never, undefined, compat as never);
    await expect(service.submit({ vistaUserId: 'u' } as never, 'a', { programVersionId: 'v' } as never)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
