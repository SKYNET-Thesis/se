// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type URDFLoader from 'urdf-loader';
import { RobotScene } from './robotScene';

const state = vi.hoisted(() => ({ stallUrdf: false, stallCompile: false, separateMeshes: false, signal: undefined as AbortSignal | undefined, geometries: [] as THREE.BufferGeometry[], frames: [] as FrameRequestCallback[], joint: vi.fn(), render: vi.fn(), dispose: vi.fn() }));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    shadowMap = {}; setPixelRatio = vi.fn(); setSize = vi.fn();
    render = state.render; dispose = state.dispose;
    compileAsync() { return state.stallCompile ? new Promise<void>(() => undefined) : Promise.resolve(); }
  }, PMREMGenerator: class { fromScene() { return { texture: new actual.Texture() }; } dispose = vi.fn(); } };
});

vi.mock('urdf-loader', () => ({ default: class {
  loadMeshCb?: URDFLoader['loadMeshCb'];
  fetchOptions: RequestInit = {};
  constructor(private manager: THREE.LoadingManager) {}
  load(_url: string, done: (robot: THREE.Group) => void) {
    state.signal = this.fetchOptions.signal ?? undefined;
    if (state.stallUrdf) return;
    this.manager.itemStart('urdf');
    const robot = Object.assign(new THREE.Group(), { joints: {}, setJointValue: state.joint });
    // Two visuals share a mesh, as the real SO-101 URDF does.
    for (let i = 0; i < 2; i++) this.loadMeshCb?.(state.separateMeshes ? `${i}.stl` : 'arm.stl', this.manager, new THREE.MeshStandardMaterial(), mesh => {
      if (mesh) robot.add(mesh);
      if (mesh instanceof THREE.Mesh) state.geometries.push(mesh.geometry);
    });
    done(robot); this.manager.itemEnd('urdf');
  }
} }));

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = [];
  postMessage = vi.fn<(message: { id: number; url: string } | { sigma: number }) => void>();
  terminate = vi.fn();
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  constructor(readonly url: URL) { super(); FakeWorker.instances.push(this); }
  succeed() {
    const request = this.postMessage.mock.calls[0][0];
    if (!('id' in request)) throw new Error('Expected an STL request');
    const id = request.id;
    this.dispatchEvent(new MessageEvent('message', { data: { id, position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) } }));
  }
}

describe('homepage scene load boundary', () => {
  let scene: RobotScene;
  beforeEach(() => {
    vi.useFakeTimers(); vi.clearAllMocks(); state.stallUrdf = false; state.stallCompile = false; state.separateMeshes = false; state.signal = undefined; state.geometries = []; state.frames = []; FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { state.frames.push(callback); return state.frames.length; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    scene = new RobotScene(document.createElement('canvas'), { azimuth: 0, elevation: 0, distance: 3, targetY: 0, fov: 30 }, { worker: true });
  });
  afterEach(() => { scene.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('keeps successful shared-mesh loading and releases its worker', async () => {
    const loaded = scene.load(); const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledOnce(); worker.succeed();
    await expect(loaded).resolves.toBeUndefined();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'messageerror'])('rejects scene loading on STL worker %s', async (type) => {
    const loaded = scene.load(); const rejected = expect(loaded).rejects.toThrow();
    FakeWorker.instances[0].dispatchEvent(new Event(type)); await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a worker that never replies', async () => {
    const rejected = vi.fn(); void scene.load().catch(rejected);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(rejected).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it.each(['URDF', 'shader compilation'])('bounds stalled %s loading', async (step) => {
    state.stallUrdf = step === 'URDF'; state.stallCompile = step === 'shader compilation';
    if (state.stallCompile) {
      scene.dispose();
      scene = new RobotScene(document.createElement('canvas'), { azimuth: 0, elevation: 0, distance: 3, targetY: 0, fov: 30 }, { worker: true, precompile: true });
    }
    const rejected = vi.fn(); void scene.load().catch(rejected);
    if (state.stallCompile) FakeWorker.instances[0].succeed();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/timed out/i) }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects an interrupted load, releases its worker, and disposes only once', async () => {
    const rejected = vi.fn(); void scene.load().catch(rejected);
    scene.dispose(); scene.dispose(); await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toHaveBeenCalledOnce(); expect(state.dispose).toHaveBeenCalledOnce();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('releases a partially loaded mesh when a later mesh fails', async () => {
    state.separateMeshes = true;
    const loaded = scene.load(); const failed = expect(loaded).rejects.toThrow();
    const worker = FakeWorker.instances[0]; worker.succeed(); await vi.advanceTimersByTimeAsync(0);
    const geometry = state.geometries[0]; const disposed = vi.fn(); geometry.addEventListener('dispose', disposed);
    worker.dispatchEvent(new Event('error')); await failed;
    scene.dispose(); await vi.advanceTimersByTimeAsync(0);
    expect(disposed).toHaveBeenCalledOnce();
  });

  it('aborts the URDF request when the scene load times out', async () => {
    state.stallUrdf = true; const rejected = vi.fn(); void scene.load().catch(rejected);
    expect(state.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(state.signal?.aborted).toBe(true); expect(rejected).toHaveBeenCalledOnce();
  });

  it.each(['error', 'messageerror', 'timeout', 'invalid reply', 'success'])('settles environment worker %s and cleans up before compiling', async (result) => {
    scene.dispose(); FakeWorker.instances = [];
    vi.stubGlobal('OffscreenCanvas', class {});
    scene = new RobotScene(document.createElement('canvas'), { azimuth: 0, elevation: 0, distance: 3, targetY: 0, fov: 30 }, { worker: true, envWorker: true, precompile: true });
    const environment = FakeWorker.instances.find(worker => worker.url.pathname.includes('envWorker'));
    const loaded = scene.load(); FakeWorker.instances.find(worker => worker.url.pathname.includes('stlWorker'))?.succeed();
    if (!environment) throw new Error('Expected an environment worker');
    if (result === 'error') environment.onerror?.(new ErrorEvent('error'));
    else if (result === 'messageerror') environment.onmessageerror?.();
    else if (result === 'invalid reply') environment.onmessage?.(new MessageEvent('message', { data: null }));
    else if (result === 'success') environment.onmessage?.(new MessageEvent('message', { data: { width: 1, height: 1, data: new Uint16Array(4) } }));
    else await vi.advanceTimersByTimeAsync(10_000);
    await expect(loaded).resolves.toBeUndefined();
    expect(environment.terminate).toHaveBeenCalledOnce();
    expect(environment.onmessage).toBeNull(); expect(environment.onerror).toBeNull(); expect(environment.onmessageerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the environment worker on scene disposal without waiting for its timeout', async () => {
    scene.dispose(); FakeWorker.instances = []; vi.stubGlobal('OffscreenCanvas', class {});
    scene = new RobotScene(document.createElement('canvas'), { azimuth: 0, elevation: 0, distance: 3, targetY: 0, fov: 30 }, { worker: true, envWorker: true, precompile: true });
    const rejected = vi.fn(); void scene.load().catch(rejected); scene.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(rejected).toHaveBeenCalledOnce();
    for (const worker of FakeWorker.instances) expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('snaps in-flight motion when reduced motion is enabled, then allows easing again', async () => {
    const loaded = scene.load(); FakeWorker.instances[0].succeed(); await loaded;
    scene.setPose({ Pitch: 0.2 }); scene.setReducedMotion(true);
    state.frames[state.frames.length - 1]?.(performance.now() + 16);
    expect(state.joint).toHaveBeenCalledWith('Pitch', 0.2);
    state.joint.mockClear(); scene.setReducedMotion(false); scene.setPose({ Pitch: 0.6 });
    state.frames[state.frames.length - 1]?.(performance.now() + 16);
    expect(state.joint).not.toHaveBeenCalledWith('Pitch', 0.6);
  });
});
