/**
 * VMESH v1: the compact, indexed mesh format of the homepage's SO-101 preview (public/assets/so101/meshes-web).
 * It is derived from the unmodified SO-ARM100 STL files by scripts/build-so101-web-meshes.ts (welded, simplified, smooth normals
 * with creases kept) and decoded here, in the mesh worker. Every field is bounds-checked: a truncated or corrupt file throws
 * instead of drawing garbage.
 *
 * Layout (little endian): u32 magic 'VMSH' | u32 version (1) | u32 vertexCount | u32 indexCount | u32 flags (bit 0: 32-bit indices)
 * then vertexCount × 3 float32 positions | vertexCount × 3 int8 normals, padded to 4 bytes | indexCount × (2 or 4) byte indices, padded to 4.
 */
export const VMESH_MAGIC = 0x48534d56;
export const VMESH_VERSION = 1;
const HEADER = 20;

export interface VMeshData {
  position: Float32Array;
  /** Unit normals, one per vertex. */
  normal: Float32Array;
  index: Uint16Array | Uint32Array;
}

export interface VMeshSource { position: Float32Array; normal: Int8Array; index: Uint16Array | Uint32Array }

const pad4 = (n: number) => (4 - (n % 4)) % 4;

export function encodeVmesh({ position, normal, index }: VMeshSource): ArrayBuffer {
  const vertexCount = position.length / 3;
  if (!Number.isInteger(vertexCount) || vertexCount < 1 || normal.length !== position.length || index.length < 3 || index.length % 3 !== 0) throw new Error('VMESH: inconsistent mesh.');
  const wide = vertexCount > 65535;
  const normalBytes = normal.length + pad4(normal.length);
  const indexBytes = index.length * (wide ? 4 : 2); const total = HEADER + position.byteLength + normalBytes + indexBytes + pad4(indexBytes);
  const out = new ArrayBuffer(total); const view = new DataView(out);
  view.setUint32(0, VMESH_MAGIC, true); view.setUint32(4, VMESH_VERSION, true); view.setUint32(8, vertexCount, true); view.setUint32(12, index.length, true); view.setUint32(16, wide ? 1 : 0, true);
  new Float32Array(out, HEADER, position.length).set(position);
  new Int8Array(out, HEADER + position.byteLength, normal.length).set(normal);
  const at = HEADER + position.byteLength + normalBytes;
  if (wide) new Uint32Array(out, at, index.length).set(index); else new Uint16Array(out, at, index.length).set(index);
  return out;
}

export function decodeVmesh(buffer: ArrayBuffer): VMeshData {
  if (buffer.byteLength < HEADER) throw new Error('VMESH: file is too short.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== VMESH_MAGIC) throw new Error('VMESH: not a mesh file.');
  if (view.getUint32(4, true) !== VMESH_VERSION) throw new Error('VMESH: unsupported version.');
  const vertexCount = view.getUint32(8, true); const indexCount = view.getUint32(12, true); const wide = (view.getUint32(16, true) & 1) === 1;
  if (vertexCount < 1 || vertexCount > 4_000_000 || indexCount < 3 || indexCount % 3 !== 0 || indexCount > 12_000_000) throw new Error('VMESH: invalid counts.');
  if (wide !== vertexCount > 65535) throw new Error('VMESH: index width does not match the vertex count.');
  const normalBytes = vertexCount * 3 + pad4(vertexCount * 3); const indexBytes = indexCount * (wide ? 4 : 2);
  if (buffer.byteLength !== HEADER + vertexCount * 12 + normalBytes + indexBytes + pad4(indexBytes)) throw new Error('VMESH: file size does not match its header.');
  const position = new Float32Array(buffer, HEADER, vertexCount * 3);
  const raw = new Int8Array(buffer, HEADER + vertexCount * 12, vertexCount * 3);
  const at = HEADER + vertexCount * 12 + normalBytes;
  const index = wide ? new Uint32Array(buffer, at, indexCount) : new Uint16Array(buffer, at, indexCount);
  for (let i = 0; i < index.length; i += 1) if (index[i] >= vertexCount) throw new Error('VMESH: an index points outside the vertices.');
  for (let i = 0; i < position.length; i += 1) if (!Number.isFinite(position[i])) throw new Error('VMESH: a position is not a finite number.');
  const normal = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i] / 127, y = raw[i + 1] / 127, z = raw[i + 2] / 127; const length = Math.hypot(x, y, z) || 1;
    normal[i] = x / length; normal[i + 1] = y / length; normal[i + 2] = z / length;
  }
  return { position: position.slice(), normal, index: index.slice() as Uint16Array | Uint32Array };
}
