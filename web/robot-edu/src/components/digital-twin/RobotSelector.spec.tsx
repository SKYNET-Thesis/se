// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RobotSelector } from './RobotSelector';

let root: Root | undefined;
let host: HTMLDivElement | undefined;
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root?.unmount()); host?.remove(); root = undefined; host = undefined; });

describe('RobotSelector', () => {
  it('selects only an authorized allocated robot and disables unavailable robots', async () => {
    const select = vi.fn(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    await act(async () => root?.render(<RobotSelector loading={false} error={null} selectedRobotId={undefined} onSelect={select} robots={[
      { id: 'robot-a', name: 'Follower A', modelName: 'SO-101', status: 'available', allocationStatus: 'allocated', viewerAccess: 'authorized' },
      { id: 'robot-b', name: 'Follower B', modelName: 'SO-101', status: 'offline', allocationStatus: 'not_allocated', viewerAccess: 'unavailable' },
    ]} />));
    const [authorized, unavailable] = [...host.querySelectorAll('button')];
    expect(authorized.disabled).toBe(false); expect(unavailable.disabled).toBe(true);
    await act(async () => authorized.click());
    expect(select).toHaveBeenCalledWith('robot-a');
    expect(host.textContent).toContain('Viewer access unavailable');
  });
});
