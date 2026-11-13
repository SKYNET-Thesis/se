import type { BufferGeometry } from 'three';

/**
 * Shared, public SO-101 mesh assets. Geometries are immutable and identical for every learner, so one parsed copy per
 * page session is safe to reuse: it removes duplicate in-flight downloads (several URDF links share a mesh) and the
 * 16 MB re-download + re-parse on every visit to a workspace. Nothing user-specific is ever cached here.
 */
const MESH_BASE = '/assets/so101/meshes/';
export const SO101_URDF = '/assets/so101/urdf/so101_new_calib.urdf';
const geometries = new Map<string, Promise<BufferGeometry>>();

export function loadSo101Geometry(file: string): Promise<BufferGeometry> {
  let pending = geometries.get(file);
  if (!pending) {
    pending = (async () => {
      const [{ STLLoader }, response] = await Promise.all([import('three/examples/jsm/loaders/STLLoader.js'), fetch(`${MESH_BASE}${file}`)]);
      if (!response.ok) throw new Error(`SO-101 mesh ${file} could not be loaded (${response.status}).`);
      return new STLLoader().parse(await response.arrayBuffer());
    })();
    pending.catch(() => geometries.delete(file)); // a failed download must be retryable, never cached
    geometries.set(file, pending);
  }
  return pending;
}

let prefetched: Promise<void> | null = null;
/** Warms the 3D chunk and every mesh so the preview is ready as soon as the workspace data is. Safe to call repeatedly. */
export function prefetchSo101Assets(): Promise<void> {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return Promise.resolve();
  prefetched ??= (async () => {
    void import('urdf-loader/src/urdf-manipulator-element.js');
    void import('three');
    const urdf = await (await fetch(SO101_URDF)).text();
    const files = [...new Set([...urdf.matchAll(/filename="([^"]+\.stl)"/gi)].map((match) => match[1].split('/').pop() as string))];
    await Promise.all(files.map((file) => loadSo101Geometry(file).catch(() => undefined)));
  })().catch(() => { prefetched = null; });
  return prefetched;
}
