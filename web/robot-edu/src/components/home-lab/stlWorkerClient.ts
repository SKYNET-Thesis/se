export const STL_WORKER_TIMEOUT_MS = 30_000;

interface MeshData { position: Float32Array; normal?: Float32Array }
type MeshWorker = EventTarget & { postMessage(message: { id: number; url: string }): void; terminate(): void };
interface PendingMesh {
  resolve: (data: MeshData) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One worker shared by the meshes of a single homepage scene. */
export class StlWorkerClient {
  private worker: MeshWorker | null = null;
  private nextId = 0;
  private pending = new Map<number, PendingMesh>();
  private failure: Error | null = null;

  constructor(private readonly createWorker: () => MeshWorker = () => new Worker(new URL('./stlWorker.ts', import.meta.url), { type: 'module' })) {}

  parse(url: string): Promise<MeshData> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => this.fail(new Error('STL worker timed out.')), STL_WORKER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        if (!this.worker) {
          this.worker = this.createWorker();
          this.worker.addEventListener('message', this.onMessage);
          this.worker.addEventListener('error', this.onError);
          this.worker.addEventListener('messageerror', this.onMessageError);
        }
        this.worker.postMessage({ id, url });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error('STL worker could not start.'));
      }
    });
  }

  private onMessage = (event: Event) => {
    if (!(event instanceof MessageEvent)) return;
    const data: unknown = event.data;
    if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'number') {
      this.fail(new Error('Invalid STL worker reply.')); return;
    }
    const job = this.pending.get(data.id);
    if (!job) return; // A duplicate/late reply must not settle a different mesh.
    if ('error' in data) {
      this.fail(new Error(typeof data.error === 'string' ? data.error : 'Mesh parse failed.')); return;
    }
    if (!('position' in data) || !(data.position instanceof Float32Array) || !data.position.length || data.position.length % 9 !== 0) {
      this.fail(new Error('Invalid STL mesh positions.')); return;
    }
    const normal = 'normal' in data ? data.normal : undefined;
    if (normal !== undefined && (!(normal instanceof Float32Array) || normal.length !== data.position.length)) {
      this.fail(new Error('Invalid STL mesh normals.')); return;
    }
    clearTimeout(job.timer);
    this.pending.delete(data.id);
    job.resolve({ position: data.position, normal });
  };

  private onError = (event: Event) => {
    event.preventDefault();
    this.fail(new Error(event instanceof ErrorEvent && event.message ? event.message : 'STL worker failed.'));
  };
  private onMessageError = () => this.fail(new Error('STL worker reply could not be decoded.'));

  private fail(error: Error) {
    this.failure ??= error;
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage);
      this.worker.removeEventListener('error', this.onError);
      this.worker.removeEventListener('messageerror', this.onMessageError);
      this.worker.terminate();
      this.worker = null;
    }
    for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(this.failure); }
    this.pending.clear();
  }

  dispose() { this.fail(new Error('STL worker was disposed.')); }
}
