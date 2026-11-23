/**
 * Derives the homepage's web meshes from the unmodified SO-ARM100 STL files (Apache-2.0, see public/assets/so101/NOTICE.md):
 * weld identical vertices, simplify with meshoptimizer, recompute smooth normals (creased at hard edges), write VMESH v1.
 * The STL originals are never changed. Re-run after changing the parameters, then commit the output.
 *
 *   npx vite-node scripts/build-so101-web-meshes.ts [--ratio 0.2] [--error 0.002] [--crease 40]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
// @ts-expect-error three ships this WASM module without type declarations
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { encodeVmesh } from '../src/components/home-lab/vmesh';

const args = process.argv.slice(2);
const arg = (name: string, fallback: number) => { const i = args.indexOf(name); return i === -1 ? fallback : Number(args[i + 1]); };
const RATIO = arg('--ratio', 0.2); const MAX_ERROR = arg('--error', 0.002); const CREASE_DEG = arg('--crease', 40);
const root = path.resolve(import.meta.dirname, '../public/assets/so101');
const source = path.join(root, 'meshes'); const target = path.join(root, 'meshes-web');

/** Binary STL → welded, indexed triangles (exact-position weld, degenerate triangles dropped). */
function readStl(buffer: Buffer) {
  const count = buffer.readUInt32LE(80);
  if (buffer.length !== 84 + count * 50) throw new Error('not a binary STL of the expected size');
  const keys = new Map<string, number>(); const positions: number[] = []; const indices: number[] = [];
  const bits = new Uint32Array(3); const view = new Float32Array(bits.buffer);
  for (let t = 0; t < count; t += 1) {
    const tri: number[] = [];
    for (let v = 0; v < 3; v += 1) {
      const at = 84 + t * 50 + 12 + v * 12;
      for (let k = 0; k < 3; k += 1) view[k] = buffer.readFloatLE(at + k * 4);
      const key = `${bits[0]},${bits[1]},${bits[2]}`;
      let id = keys.get(key);
      if (id === undefined) { id = positions.length / 3; keys.set(key, id); positions.push(view[0], view[1], view[2]); }
      tri.push(id);
    }
    if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) indices.push(...tri);
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) };
}

/** Per-corner normals: each corner averages the faces around its vertex whose normals lie within the crease angle of its own face. */
function creasedNormals(positions: Float32Array, indices: Uint32Array) {
  const triangles = indices.length / 3; const face = new Float32Array(triangles * 3);
  const corners = new Map<number, number[]>();
  for (let t = 0; t < triangles; t += 1) {
    const [a, b, c] = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
    const ux = positions[b * 3] - positions[a * 3], uy = positions[b * 3 + 1] - positions[a * 3 + 1], uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const vx = positions[c * 3] - positions[a * 3], vy = positions[c * 3 + 1] - positions[a * 3 + 1], vz = positions[c * 3 + 2] - positions[a * 3 + 2];
    face[t * 3] = uy * vz - uz * vy; face[t * 3 + 1] = uz * vx - ux * vz; face[t * 3 + 2] = ux * vy - uy * vx;   // area-weighted
    for (const v of [a, b, c]) { const list = corners.get(v); if (list) list.push(t); else corners.set(v, [t]); }
  }
  const unit = (t: number) => { const l = Math.hypot(face[t * 3], face[t * 3 + 1], face[t * 3 + 2]) || 1; return [face[t * 3] / l, face[t * 3 + 1] / l, face[t * 3 + 2] / l]; };
  const cos = Math.cos((CREASE_DEG * Math.PI) / 180);
  const outPositions: number[] = []; const outNormals: number[] = []; const outIndices: number[] = []; const seen = new Map<string, number>();
  for (let t = 0; t < triangles; t += 1) {
    const own = unit(t);
    for (let k = 0; k < 3; k += 1) {
      const v = indices[t * 3 + k]; let nx = 0, ny = 0, nz = 0;
      for (const other of corners.get(v) ?? []) {
        const u = unit(other);
        if (own[0] * u[0] + own[1] * u[1] + own[2] * u[2] >= cos) { nx += face[other * 3]; ny += face[other * 3 + 1]; nz += face[other * 3 + 2]; }
      }
      const l = Math.hypot(nx, ny, nz) || 1; const q = [nx / l, ny / l, nz / l].map((n) => Math.max(-127, Math.min(127, Math.round(n * 127))));
      const key = `${v}:${q.join(',')}`; let id = seen.get(key);
      if (id === undefined) { id = outPositions.length / 3; seen.set(key, id); outPositions.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); outNormals.push(...q); }
      outIndices.push(id);
    }
  }
  return { position: new Float32Array(outPositions), normal: new Int8Array(outNormals), index: outIndices.length > 65535 * 3 && outPositions.length / 3 > 65535 ? new Uint32Array(outIndices) : new Uint16Array(outIndices) };
}

await MeshoptSimplifier.ready;
mkdirSync(target, { recursive: true });
const manifest: Record<string, unknown> = { format: 'VMESH v1', parameters: { ratio: RATIO, maxRelativeError: MAX_ERROR, creaseDegrees: CREASE_DEG }, tool: 'meshoptimizer (three/examples/jsm/libs/meshopt_simplifier.module.js)', files: {} as Record<string, unknown> };
let beforeTriangles = 0, afterTriangles = 0, beforeBytes = 0, afterBytes = 0; let worst = 0;
for (const file of readdirSync(source).filter((f) => f.endsWith('.stl')).sort()) {
  const original = readFileSync(path.join(source, file));
  const mesh = readStl(original);
  const targetCount = Math.max(3 * 12, Math.floor((mesh.indices.length * RATIO) / 3) * 3);
  const [simplified, error] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, targetCount, MAX_ERROR) as [Uint32Array, number];
  const scale = MeshoptSimplifier.getScale(mesh.positions, 3) as number;
  const out = creasedNormals(mesh.positions, simplified);
  const encoded = Buffer.from(encodeVmesh(out));
  const name = file.replace(/\.stl$/i, '.msh');
  writeFileSync(path.join(target, name), encoded);
  const before = (original.length - 84) / 50; const after = simplified.length / 3;
  beforeTriangles += before; afterTriangles += after; beforeBytes += original.length; afterBytes += encoded.length; worst = Math.max(worst, error);
  (manifest.files as Record<string, unknown>)[name] = { source: file, sourceSha256: createHash('sha256').update(original).digest('hex'), trianglesBefore: before, trianglesAfter: after, relativeError: +error.toFixed(5), absoluteErrorUnits: +(error * scale).toFixed(4), bytesBefore: original.length, bytesAfter: encoded.length };
  console.log(`${file.padEnd(40)} ${String(before).padStart(7)} -> ${String(after).padStart(6)} tris  err ${(error * 100).toFixed(3)}%  ${(original.length / 1024).toFixed(0).padStart(5)} -> ${(encoded.length / 1024).toFixed(0).padStart(4)} KiB`);
}
Object.assign(manifest, { totals: { trianglesBefore: beforeTriangles, trianglesAfter: afterTriangles, bytesBefore: beforeBytes, bytesAfter: afterBytes, worstRelativeError: +worst.toFixed(5) } });
writeFileSync(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`TOTAL ${beforeTriangles} -> ${afterTriangles} triangles (${((afterTriangles / beforeTriangles) * 100).toFixed(0)}%), ${(beforeBytes / 1048576).toFixed(1)} -> ${(afterBytes / 1048576).toFixed(2)} MiB, worst error ${(worst * 100).toFixed(3)}%`);
