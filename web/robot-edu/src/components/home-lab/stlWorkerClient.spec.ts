// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StlWorkerClient, STL_WORKER_TIMEOUT_MS } from './stlWorkerClient';

class FakeWorker extends EventTarget {
  postMessage = vi.fn<(message: { id: number; url: string }) => void>();
  terminate = vi.fn();
  reply(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

function watch<T>(promise: Promise<T>) {
  const resolved = vi.fn(); const rejected = vi.fn();
  void promise.then(resolved, rejected);
  return { resolved, rejected };
}

describe('homepage STL worker lifecycle', () => {
  let worker: FakeWorker; let client: StlWorkerClient;
  beforeEach(() => { vi.useFakeTimers(); worker = new FakeWorker(); client = new StlWorkerClient(() => worker); });
  afterEach(() => { client.dispose(); vi.useRealTimers(); });

  it('matches concurrent replies by job ID and ignores a duplicate reply', async () => {
    const first = watch(client.parse('arm.stl')); const second = watch(client.parse('servo.stl'));
    const [a, b] = worker.postMessage.mock.calls.map(([message]) => message.id);
    const position = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normal = new Float32Array(9);
    worker.reply({ id: b, position, normal }); worker.reply({ id: a, position }); worker.reply({ id: a, position });
    await vi.advanceTimersByTimeAsync(STL_WORKER_TIMEOUT_MS);
    expect(first.resolved).toHaveBeenCalledOnce(); expect(second.resolved).toHaveBeenCalledOnce();
    expect(first.resolved).toHaveBeenCalledWith(expect.objectContaining({ position }));
    expect(second.resolved).toHaveBeenCalledWith({ position, normal });
    expect(first.rejected).not.toHaveBeenCalled(); expect(second.rejected).not.toHaveBeenCalled();
    expect(worker.terminate).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'messageerror'])('rejects every outstanding job on worker %s and cleans up', async (type) => {
    const remove = vi.spyOn(worker, 'removeEventListener');
    const jobs = [watch(client.parse('arm.stl')), watch(client.parse('servo.stl'))];
    worker.dispatchEvent(new Event(type));
    await vi.advanceTimersByTimeAsync(0);
    for (const job of jobs) expect(job.rejected).toHaveBeenCalledWith(expect.any(Error));
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(remove.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['message', 'error', 'messageerror']));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects all jobs after the bounded timeout and cannot restart the failed worker', async () => {
    const jobs = [watch(client.parse('arm.stl')), watch(client.parse('servo.stl'))];
    await vi.advanceTimersByTimeAsync(STL_WORKER_TIMEOUT_MS);
    for (const job of jobs) expect(job.rejected).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/timed out/i) }));
    const later = watch(client.parse('later.stl')); await vi.advanceTimersByTimeAsync(0);
    expect(later.rejected).toHaveBeenCalled(); expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('settles pending work on disposal and ignores late replies', async () => {
    const job = watch(client.parse('arm.stl')); const id = worker.postMessage.mock.calls[0][0].id;
    client.dispose(); client.dispose(); worker.reply({ id, position: new Float32Array(9) });
    await vi.advanceTimersByTimeAsync(0);
    expect(job.rejected).toHaveBeenCalledOnce(); expect(job.resolved).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it('returns a rejected promise when worker construction fails', async () => {
    client = new StlWorkerClient(() => { throw new Error('Worker blocked'); });
    await expect(client.parse('arm.stl')).rejects.toThrow('Worker blocked');
  });

  it('rejects every pending job if posting a request throws', async () => {
    const first = watch(client.parse('arm.stl'));
    worker.postMessage.mockImplementationOnce(() => { throw new Error('Cannot clone request'); });
    const second = watch(client.parse('servo.stl')); await vi.advanceTimersByTimeAsync(0);
    expect(first.rejected).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cannot clone request' }));
    expect(second.rejected).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cannot clone request' }));
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ error: 'Fetch failed' }, { position: 'invalid' }, { position: new Float32Array(9), normal: new Float32Array(3) }])('rejects failed or malformed mesh replies: %j', async (reply) => {
    const first = watch(client.parse('arm.stl')); const second = watch(client.parse('servo.stl'));
    worker.reply({ id: worker.postMessage.mock.calls[0][0].id, ...reply });
    await vi.advanceTimersByTimeAsync(0);
    expect(first.rejected).toHaveBeenCalledWith(expect.any(Error)); expect(second.rejected).toHaveBeenCalledWith(expect.any(Error));
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('indexed web meshes through the worker client', () => {
  let worker: FakeWorker; let client: StlWorkerClient;
  beforeEach(() => { vi.useFakeTimers(); worker = new FakeWorker(); client = new StlWorkerClient(() => worker); });
  afterEach(() => { client.dispose(); vi.useRealTimers(); });
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]); // four vertices: not a multiple of nine floats, valid when indexed

  it('accepts indexed geometry with 16- or 32-bit indices', async () => {
    for (const index of [new Uint16Array([0, 1, 2, 1, 3, 2]), new Uint32Array([0, 1, 2])]) {
      const job = watch(client.parse('arm.msh')); const id = worker.postMessage.mock.calls.at(-1)![0].id;
      worker.reply({ id, position: vertices, normal: new Float32Array(12), index });
      await vi.advanceTimersByTimeAsync(0);
      expect(job.resolved).toHaveBeenCalledWith({ position: vertices, normal: expect.any(Float32Array), index }); expect(job.rejected).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['an index outside the vertices', { index: new Uint16Array([0, 1, 9]) }],
    ['indices that are not whole triangles', { index: new Uint16Array([0, 1]) }],
    ['indices of the wrong type', { index: new Int16Array([0, 1, 2]) }],
    ['normals that do not match the vertices', { index: new Uint16Array([0, 1, 2]), normal: new Float32Array(3) }],
  ])('rejects %s and fails the whole client', async (_name, extra) => {
    const job = watch(client.parse('arm.msh')); const id = worker.postMessage.mock.calls.at(-1)![0].id;
    worker.reply({ id, position: vertices, ...extra });
    await vi.advanceTimersByTimeAsync(0);
    expect(job.rejected).toHaveBeenCalledOnce(); expect(job.resolved).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('still requires whole triangles for non-indexed (STL) meshes', async () => {
    const job = watch(client.parse('arm.stl')); const id = worker.postMessage.mock.calls.at(-1)![0].id;
    worker.reply({ id, position: vertices });
    await vi.advanceTimersByTimeAsync(0);
    expect(job.rejected).toHaveBeenCalledOnce();
  });
});
