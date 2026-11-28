import { ExperimentEvidenceService } from './experiment-evidence.service';

/** Production regression: the object store rejected the write (missing IAM prefix) and the artifact INSERT then violated the table check. */
describe('persistTelemetry when the object store does not accept the evidence', () => {
  it('stores no artifact row and reports unavailable instead of throwing', async () => {
    const scope = { experiment_id: 'e', learner_user_id: 'u', classroom_id: 'c', organization_id: 'o', assignment_id: 'a' };
    const insert = jest.fn();
    const answers: unknown[][] = [[scope], []];
    const prisma = { $queryRaw: jest.fn(async () => answers.shift() ?? []), $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({ $executeRaw: insert, $queryRaw: insert })) };
    const storage = { newKey: () => 'learning-media/experiments/o/c/e/u/e.json', put: jest.fn(async () => { throw new Error('AccessDenied'); }), verify: jest.fn() };
    const svc = new ExperimentEvidenceService(prisma as never, storage as never);
    await expect(svc.persistTelemetry('e', { source_mode: 'SIMULATION', robot_id: 'r' })).resolves.toEqual({ availability: 'unavailable' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });
});
