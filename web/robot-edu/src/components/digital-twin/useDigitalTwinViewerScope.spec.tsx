// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useDigitalTwinViewerScope } from './useDigitalTwinViewerScope';

const mocks = vi.hoisted(() => ({ viewerScope: vi.fn() }));
vi.mock('../../lib/api', () => ({ ApiError: class ApiError extends Error { status = 500; }, digitalTwinApi: { viewerScope: mocks.viewerScope } }));
let root: Root | undefined; let host: HTMLDivElement | undefined;
function Probe({ robotId }: { robotId?: string }) { const next = useDigitalTwinViewerScope('access-token', robotId); return <output>{next.scope?.robotId ?? ''}</output>; }
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; mocks.viewerScope.mockReset(); });

it('keeps the new robot scope when an old robot response arrives late', async () => {
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const deferred = new Map<string, Array<(value: any) => void>>();
  mocks.viewerScope.mockImplementation((robotId: string) => new Promise(resolve => deferred.set(robotId, [...(deferred.get(robotId) ?? []), resolve])));
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  await act(async () => root?.render(<Probe robotId="robot-a" />));
  await act(async () => root?.render(<Probe robotId="robot-b" />));
  await vi.waitFor(() => { expect(deferred.has('robot-a')).toBe(true); expect(deferred.has('robot-b')).toBe(true); });
  await act(async () => { deferred.get('robot-b')!.forEach(resolve => resolve({ token: 'scope-b', expiresAt, organizationId: 'org', robotId: 'robot-b' })); await Promise.resolve(); });
  await vi.waitFor(() => expect(host.textContent).toBe('robot-b'));
  await act(async () => { deferred.get('robot-a')!.forEach(resolve => resolve({ token: 'scope-a', expiresAt, organizationId: 'org', robotId: 'robot-a' })); await Promise.resolve(); });
  expect(host.textContent).toBe('robot-b');
});
