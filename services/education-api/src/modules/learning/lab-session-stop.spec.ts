import { PhysicalExecutionService } from './physical-execution.service';

const ROBOT = 'f1c066c4-b5f2-45c4-b933-f034f3824dd9';
const EXP = '99999999-9999-4999-8999-999999999999';
const CMD = '22222222-2222-4222-8222-222222222222';

function build(opts: { lifecycle?: Array<{ command_id: string; state: string }>; already?: boolean; publishFails?: boolean } = {}) {
  const published: unknown[] = []; const inserts: unknown[] = [];
  const answers: unknown[][] = [
    [{ control_session_id: 's1', state: 'active', experiment_id: EXP, experiment_status: 'running', learner_user_id: 'u', attempt_id: 'a', submission_id: null, program_version_id: null }],   // activeSession
    [{ run_id: 'run-1' }],                                                                                                                                                                  // run id
    opts.lifecycle ?? [{ command_id: CMD, state: 'executing' }],                                                                                                                              // lifecycle
    opts.already ? [{ id: EXP }] : [],                                                                                                                                                        // earlier cancel request
  ];
  const prisma = { $queryRaw: jest.fn(async () => answers.shift() ?? []), $executeRaw: jest.fn(async (...args: unknown[]) => { inserts.push(args); return 1; }) };
  const iot = {
    enabled: () => true,
    createCancelCommand: jest.fn((robotId: string, payload: Record<string, string>) => ({ schemaVersion: 1, kind: 'cancel', commandId: '33333333-3333-4333-8333-333333333333', robotId, sequence: 5, issuedAtMs: 1, expiresAtMs: 2, payload })),
    publishCancelCommand: jest.fn(async (c: unknown) => { if (opts.publishFails) throw new Error('mqtt down'); published.push(c); }),
  };
  const service = new PhysicalExecutionService(prisma as never, {} as never, undefined, iot as never);
  return { service, published, inserts, iot };
}

describe('Stop Execution over MQTT (Education API side)', () => {
  it('publishes ONE cancel bound to the robot, the active command and its run, and does not claim the stop', async () => {
    const { service, published, iot } = build();
    await expect(service.requestRobotStop(ROBOT)).resolves.toEqual({ active: true, stopRequested: true, runtimeUnavailable: false });
    expect(iot.createCancelCommand).toHaveBeenCalledWith(ROBOT, { targetCommandId: CMD, runId: 'run-1', reason: 'lab_session_stop' });
    expect(published).toHaveLength(1);
  });
  it('is idempotent: a second request for the same experiment publishes nothing', async () => {
    const { service, published } = build({ already: true });
    await expect(service.requestRobotStop(ROBOT)).resolves.toMatchObject({ stopRequested: true });
    expect(published).toHaveLength(0);
  });
  it('does not publish when the run has no dispatched, unfinished command (nothing to cancel yet, or already terminal)', async () => {
    const { service, published } = build({ lifecycle: [] });
    await expect(service.requestRobotStop(ROBOT)).resolves.toEqual({ active: true, stopRequested: false, runtimeUnavailable: false });
    expect(published).toHaveLength(0);
  });
  it('reports the runtime as unavailable when the publish fails, so the session stays blocked', async () => {
    const { service } = build({ publishFails: true });
    await expect(service.requestRobotStop(ROBOT)).resolves.toEqual({ active: true, stopRequested: false, runtimeUnavailable: true });
  });
});
