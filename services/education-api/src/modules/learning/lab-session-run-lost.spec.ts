import { ConflictException } from '@nestjs/common';
import { PhysicalExecutionService } from './physical-execution.service';

/** D-17: a quarantined Lab Session can finish releasing when the REACHABLE runtime reports that a run it had started is gone; nothing else releases it. */
describe('requestRobotStop reconciliation after a runtime restart', () => {
  const build = (status: string, cancel: () => Promise<unknown>, stillActiveAfter = false) => {
    const prisma = { $queryRaw: jest.fn(async () => [{ run_id: 'run-1' }]) };
    const runtime = { cancelRun: jest.fn(cancel) };
    const svc = new PhysicalExecutionService(prisma as never, runtime as never, undefined, undefined, undefined, undefined);
    const active = { experiment_id: 'exp', control_session_id: 'cs', experiment_status: status };
    const activeSession = jest.spyOn(svc as never, 'activeSession' as never).mockResolvedValueOnce(active as never).mockResolvedValue((stillActiveAfter ? active : null) as never);
    const persist = jest.spyOn(svc as never, 'persistRuntimeSnapshot' as never).mockResolvedValue(undefined as never);
    return { svc, persist, activeSession, runtime };
  };
  const lost = () => Promise.reject(new ConflictException({ code: 'ROBOT_RUNTIME_RUN_NOT_FOUND', message: 'lost' }));
  const unreachable = () => Promise.reject(new ConflictException({ code: 'ROBOT_RUNTIME_UNAVAILABLE', message: 'down' }));

  it('closes a RUNNING run the reachable runtime no longer knows as failed/runtime_run_lost (never succeeded) and reports the robot as no longer active', async () => {
    const t = build('running', lost);
    await expect(t.svc.requestRobotStop('robot-1')).resolves.toEqual({ active: false, stopRequested: true, runtimeUnavailable: false });
    expect(t.persist).toHaveBeenCalledWith('exp', 'cs', 'run-1', { state: 'failed', errorCode: 'runtime_run_lost' }, 'lab_session_run_lost');
  });
  it('an unreachable runtime (or a heartbeat) releases nothing: stays active and flagged unavailable', async () => {
    const t = build('running', unreachable);
    await expect(t.svc.requestRobotStop('robot-1')).resolves.toEqual({ active: true, stopRequested: false, runtimeUnavailable: true });
    expect(t.persist).not.toHaveBeenCalled();
  });
  it('a run that never started at the runtime is not treated as lost', async () => {
    const t = build('queued', lost);
    await expect(t.svc.requestRobotStop('robot-1')).resolves.toMatchObject({ active: true, runtimeUnavailable: true });
    expect(t.persist).not.toHaveBeenCalled();
  });
});
