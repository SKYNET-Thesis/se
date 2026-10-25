import { afterEach, describe, expect, it, vi } from 'vitest';
import { NestRobotExecutionClient, assertPhysicalExecutionEligible } from './robotExecution';

describe('physical execution boundary', () => {
  it('rejects learning preview coordinates before any physical client is called', () => {
    expect(() => assertPhysicalExecutionEligible([{ type: 'preview.move_xyz', mode: 'learning_preview', frame: 'learning_preview_v1', arm: 'left', position: { x: 240, y: 220, z: 120 } }])).toThrow('Physical execution rejected');
  });

  it('keeps the existing C1 canonical subset eligible at this browser boundary', () => {
    expect(() => assertPhysicalExecutionEligible([{ type: 'arm.select', arm: 'left' }, { type: 'gripper.open' }])).not.toThrow();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('uses only Education API attempt/execution identities and never sends commands', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'execution-1', status: 'queued' }) });
    vi.stubGlobal('fetch', fetcher);
    const client = new NestRobotExecutionClient();
    await client.executeProgram({ accessToken: 'token', attemptId: 'attempt-1' });
    expect(fetcher.mock.calls[0][0]).toContain('/me/attempts/attempt-1/physical-executions/start');
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('robot_program');
  });
});
