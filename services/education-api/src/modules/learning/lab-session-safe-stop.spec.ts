import { PhysicalExecutionService } from './physical-execution.service';

/** A cloud-side terminal state alone must never establish that the robot stopped. */
function service(opts: { lifecycle?: { state: string; updated_at: Date } | null; shadow?: Record<string, unknown> | null; shadowThrows?: boolean; iot?: boolean }) {
  const prisma = { $queryRaw: jest.fn(async () => (opts.lifecycle ? [opts.lifecycle] : [])) };
  const iot = opts.iot === false ? undefined : {
    enabled: () => true, shadowMaxAgeMs: () => 30_000,
    readShadow: jest.fn(async () => { if (opts.shadowThrows) throw new Error('shadow down'); return opts.shadow ?? null; }),
  };
  return new PhysicalExecutionService(prisma as never, {} as never, undefined, iot as never);
}
const gaveUp = new Date(Date.now() - 60_000);
const shadow = (over: Record<string, unknown> = {}) => ({ connection: 'connected', reportedAtMs: Date.now() - 1_000, ...over });

describe('safe-stop confirmation before a reservation is released', () => {
  it.each(['timed_out', 'reconciliation_required'])('treats %s (cloud gave up, outcome unknown) as UNCONFIRMED without a fresh idle Edge Shadow', async (state) => {
    await expect(service({ lifecycle: { state, updated_at: gaveUp }, shadow: null }).edgeStopUnconfirmed('r')).resolves.toBe(true);
    await expect(service({ lifecycle: { state, updated_at: gaveUp }, shadow: shadow({ reportedAtMs: gaveUp.getTime() - 5_000 }) }).edgeStopUnconfirmed('r')).resolves.toBe(true);   // reported before the cloud gave up
    await expect(service({ lifecycle: { state, updated_at: gaveUp }, shadow: shadow({ activeRunId: 'run-1' }) }).edgeStopUnconfirmed('r')).resolves.toBe(true);                   // a run is still active
    await expect(service({ lifecycle: { state, updated_at: gaveUp }, shadow: shadow({ connection: 'disconnected' }) }).edgeStopUnconfirmed('r')).resolves.toBe(true);
    await expect(service({ lifecycle: { state, updated_at: gaveUp }, shadowThrows: true }).edgeStopUnconfirmed('r')).resolves.toBe(true);                                         // cannot verify => blocked
  });
  it('accepts a connected, fresh Edge Shadow reported after the cloud gave up with no active run', async () => {
    await expect(service({ lifecycle: { state: 'timed_out', updated_at: gaveUp }, shadow: shadow() }).edgeStopUnconfirmed('r')).resolves.toBe(false);
  });
  it('does not withhold when the Edge itself reported the terminal status (completed/failed) or no MQTT command exists', async () => {
    for (const state of ['completed', 'failed', 'publish_failed']) await expect(service({ lifecycle: { state, updated_at: gaveUp } }).edgeStopUnconfirmed('r')).resolves.toBe(false);
    await expect(service({ lifecycle: null }).edgeStopUnconfirmed('r')).resolves.toBe(false);
    await expect(service({ lifecycle: { state: 'timed_out', updated_at: gaveUp }, iot: false }).edgeStopUnconfirmed('r')).resolves.toBe(false);
  });
});
