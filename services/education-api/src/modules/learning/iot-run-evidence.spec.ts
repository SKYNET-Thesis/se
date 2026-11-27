import { PhysicalExecutionService } from './physical-execution.service';

const EXP = '99999999-9999-4999-8999-999999999999';
const student = { status: 'active', memberships: [{ status: 'active', roleCode: 'student', permissions: ['learning.experiment.execute'] }], vistaUserId: 'u' } as never;
function build(lifecycleState: string, frames: Array<{ event_data: unknown }>, persisted = { availability: 'available' as const, artifactId: 'a1' }) {
  const answers: unknown[][] = [[{ state: lifecycleState, acknowledged_at: null, completed_at: null, error_code: null }], frames];
  const prisma = { $queryRaw: jest.fn(async () => answers.shift() ?? []) };
  const evidence = { persistTelemetry: jest.fn(async () => persisted) };
  const iot = { enabled: () => true };
  const svc = new PhysicalExecutionService(prisma as never, {} as never, undefined, iot as never, undefined, evidence as never);
  jest.spyOn(svc as never, 'execution' as never).mockResolvedValue({ experiment_id: EXP, control_session_id: 's', robot_id: 'r', robot_name: 'R', robot_model: 'M', robot_serial: 'S', program_version_id: 'p', status: 'running', run_id: null, organization_id: 'o' } as never);
  return { svc, evidence };
}

describe('cloud simulation evidence is created from the real relayed frame once the run has succeeded', () => {
  it('persists the stored latest frame for a succeeded run and reports availability', async () => {
    const frame = { schema_version: 1, source_mode: 'SIMULATION', robot_id: 'r' };
    const { svc, evidence } = build('completed', [{ event_data: frame }]);
    await expect(svc.status(student, EXP)).resolves.toMatchObject({ status: 'succeeded', evidence: 'available' });
    expect(evidence.persistTelemetry).toHaveBeenCalledWith(EXP, frame);
  });
  it('creates nothing while the run is not terminally successful, and never fabricates a frame', async () => {
    for (const state of ['executing', 'acknowledged', 'failed', 'timed_out']) {
      const { svc, evidence } = build(state, [{ event_data: { source_mode: 'SIMULATION' } }]);
      await svc.status(student, EXP);
      expect(evidence.persistTelemetry).not.toHaveBeenCalled();
    }
    const { svc, evidence } = build('completed', []);                                         // succeeded but no relayed frame exists
    await expect(svc.status(student, EXP)).resolves.toMatchObject({ evidence: 'unavailable' });
    expect(evidence.persistTelemetry).not.toHaveBeenCalled();
  });
  it('a failing evidence persistence never makes the run status fail', async () => {
    const { svc, evidence } = build('completed', [{ event_data: { source_mode: 'SIMULATION' } }]);
    evidence.persistTelemetry.mockRejectedValueOnce(new Error('db check violation') as never);
    await expect(svc.status(student, EXP)).resolves.toMatchObject({ status: 'succeeded', evidence: 'unavailable' });
  });
});
