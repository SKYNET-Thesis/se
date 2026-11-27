import { PhysicalExecutionService } from './physical-execution.service';

const ROBOT = 'f1c066c4-b5f2-45c4-b933-f034f3824dd9';
function service(shadow: Record<string, unknown> | null | Error, simulation = true) {
  const prisma = { $queryRaw: jest.fn(async () => []) };
  const iot = { enabled: () => true, simulationStartEnabled: () => simulation, shadowMaxAgeMs: () => 30_000, readShadow: jest.fn(async () => { if (shadow instanceof Error) throw shadow; return shadow; }) };
  const runtime = { status: jest.fn(async () => { throw new Error('loopback runtime must not be used'); }) };
  const svc = new PhysicalExecutionService(prisma as never, runtime as never, undefined, iot as never);
  return { probe: () => (svc as unknown as { probeReadiness(s: unknown): Promise<Record<string, unknown>> }).probeReadiness({ robot_id: ROBOT, entitlement_id: 'e', symbolic_evaluation_id: 's', symbolic_verdict: 'passed' }), runtime };
}
const fresh = (over: Record<string, unknown> = {}) => ({ connection: 'connected', runtimeKind: 'MOCK_RUNTIME', hardwareEnabled: false, stopped: false, reportedAtMs: Date.now() - 1000, ...over });

describe('cloud simulation readiness is read from the Device Shadow (so the UI can label the run as a simulation)', () => {
  it('reports a fresh connected MOCK_RUNTIME with hardware disabled as an online fake follower, without touching the loopback runtime', async () => {
    const { probe, runtime } = service(fresh());
    await expect(probe()).resolves.toMatchObject({ runtimeOnline: true, runtimeMode: 'fake_follower', robotReady: true, checkikReachable: true });
    expect(runtime.status).not.toHaveBeenCalled();
  });
  it('never labels a physical, stale, disconnected or unreadable runtime as a simulation', async () => {
    for (const shadow of [fresh({ runtimeKind: 'PHYSICAL_ROBOT', hardwareEnabled: true }), fresh({ hardwareEnabled: true }), fresh({ reportedAtMs: Date.now() - 120_000 }), fresh({ connection: 'disconnected' }), null, new Error('shadow down')]) {
      const result = await service(shadow as never).probe();
      expect(result.runtimeMode).toBeNull(); expect(result.robotReady).toBe(false);
    }
  });
  it('a stopped simulation runtime is online but not ready', async () => {
    await expect(service(fresh({ stopped: true })).probe()).resolves.toMatchObject({ runtimeOnline: true, runtimeStopped: true, robotReady: false });
  });
});
