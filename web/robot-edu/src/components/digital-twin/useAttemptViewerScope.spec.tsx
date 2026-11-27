// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAttemptViewerScope } from './useAttemptViewerScope';

const mocks = vi.hoisted(() => ({ attemptViewerScope: vi.fn(), viewerScope: vi.fn() }));
vi.mock('../../lib/api', () => ({ digitalTwinApi: { attemptViewerScope: mocks.attemptViewerScope, viewerScope: mocks.viewerScope } }));
let root: Root | undefined; let host: HTMLDivElement | undefined;
function Probe({ robotId, enabled }: { robotId?: string; enabled: boolean }) { const next = useAttemptViewerScope('tok', 'attempt-1', robotId, enabled); return <output>{`${next.status}|${next.scope?.token ?? ''}`}</output>; }
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; mocks.attemptViewerScope.mockReset(); mocks.viewerScope.mockReset(); });
const mount = async (props: { robotId?: string; enabled: boolean }) => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); await act(async () => root?.render(<Probe {...props} />)); };

it('D-09: requests the attempt-bound scope for the run robot and never the robot-wide one', async () => {
  mocks.attemptViewerScope.mockResolvedValue({ token: 'v1.attempt', expiresAt: new Date(Date.now() + 60_000).toISOString(), organizationId: 'o', robotId: 'robot-1' });
  await mount({ robotId: 'robot-1', enabled: true });
  await vi.waitFor(() => expect(host?.textContent).toBe('authorized|v1.attempt'));
  expect(mocks.attemptViewerScope).toHaveBeenCalledWith('attempt-1', 'robot-1', 'tok');
  expect(mocks.viewerScope).not.toHaveBeenCalled();
});
it('reports unavailable with no token (so no viewer connection) when the scope is refused', async () => {
  mocks.attemptViewerScope.mockRejectedValue(new Error('404'));
  await mount({ robotId: 'robot-1', enabled: true });
  await vi.waitFor(() => expect(host?.textContent).toBe('unavailable|'));
});
it('stays idle and requests nothing until a run exists', async () => {
  await mount({ robotId: undefined, enabled: false });
  expect(host?.textContent).toBe('idle|');
  expect(mocks.attemptViewerScope).not.toHaveBeenCalled();
});
