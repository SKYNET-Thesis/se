// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraRig, SceneOptions } from './robotScene';
import { RobotCanvas } from './RobotCanvas';

const state = vi.hoisted(() => ({ options: [] as SceneOptions[], motion: vi.fn(), dispose: vi.fn(), rejectLoad: false }));
vi.mock('./robotScene', () => ({ webglAvailable: () => true, RobotScene: class {
  constructor(_node: HTMLCanvasElement, _rig: CameraRig, options: SceneOptions) { state.options.push(options); }
  resize = vi.fn(); dispose = state.dispose; setReducedMotion = state.motion;
  load() { return state.rejectLoad ? Promise.reject(new Error('Mesh failed')) : Promise.resolve(); }
} }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const rig: CameraRig = { azimuth: 0, elevation: 0, distance: 3, targetY: 0, fov: 30 };

describe('homepage canvas lifecycle', () => {
  let container: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); state.options = []; state.rejectLoad = false;
    vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
    vi.stubGlobal('requestIdleCallback', undefined); vi.stubGlobal('cancelIdleCallback', undefined);
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  const render = (reduce: boolean, onStatus = vi.fn()) => act(() => root.render(<RobotCanvas rig={rig} label="SO-101 preview" reducedMotion={reduce} onStatus={onStatus} />));

  it('updates motion preference without rebuilding the scene', async () => {
    render(false); await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    render(true); expect(state.motion).toHaveBeenLastCalledWith(true);
    render(false); expect(state.motion).toHaveBeenLastCalledWith(false);
    expect(state.options).toHaveLength(1);
  });

  it('uses the latest preference if it changes before deferred initialization', async () => {
    render(false); render(true); await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    expect(state.options[0].reducedMotion).toBe(true);
  });

  it('reports load failure to the poster owner, shows the existing fallback, and disposes', async () => {
    state.rejectLoad = true; const onStatus = vi.fn(); render(false, onStatus);
    await act(async () => { await vi.advanceTimersByTimeAsync(120); });
    expect(onStatus).toHaveBeenLastCalledWith('error');
    expect(container.textContent).toContain('The 3D preview could not start');
    expect(state.dispose).toHaveBeenCalledOnce();
    act(() => root.unmount()); expect(state.dispose).toHaveBeenCalledOnce();
    root = createRoot(container);
  });
});
