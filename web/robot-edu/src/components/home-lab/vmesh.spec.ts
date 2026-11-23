import { describe, expect, it } from 'vitest';
import { decodeVmesh, encodeVmesh, VMESH_MAGIC } from './vmesh';

const quad = () => ({ position: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), normal: new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127, 0, 0, 127]), index: new Uint16Array([0, 1, 2, 0, 2, 3]) });

describe('VMESH v1', () => {
  it('round-trips positions, indices and unit normals', () => {
    const decoded = decodeVmesh(encodeVmesh(quad()));
    expect(Array.from(decoded.position)).toEqual(Array.from(quad().position));
    expect(Array.from(decoded.index)).toEqual([0, 1, 2, 0, 2, 3]);
    for (let i = 0; i < decoded.normal.length; i += 3) expect(Math.hypot(decoded.normal[i], decoded.normal[i + 1], decoded.normal[i + 2])).toBeCloseTo(1, 5);
    expect(Array.from(decoded.normal.slice(0, 3))).toEqual([0, 0, 1]);
  });

  it('uses 32-bit indices only when 16 bits cannot address the vertices, and round-trips them', () => {
    const count = 70000; const position = new Float32Array(count * 3).map((_, i) => i % 97); const normal = new Int8Array(count * 3).fill(0).map((_, i) => (i % 3 === 2 ? 127 : 0));
    const index = new Uint32Array([0, 1, count - 1]);
    const decoded = decodeVmesh(encodeVmesh({ position, normal, index }));
    expect(decoded.index).toBeInstanceOf(Uint32Array); expect(Array.from(decoded.index)).toEqual([0, 1, count - 1]);
    expect(decodeVmesh(encodeVmesh(quad())).index).toBeInstanceOf(Uint16Array);
  });

  it('keeps every section 4-byte aligned for any vertex count', () => {
    for (const vertices of [3, 4, 5, 6, 7]) {
      const position = new Float32Array(vertices * 3); const normal = new Int8Array(vertices * 3).fill(0).map((_, i) => (i % 3 === 0 ? 127 : 0));
      const buffer = encodeVmesh({ position, normal, index: new Uint16Array([0, 1, 2]) });
      expect(buffer.byteLength % 4).toBe(0); expect(() => decodeVmesh(buffer)).not.toThrow();
    }
  });

  it.each([
    ['a file that is too short', () => new ArrayBuffer(8), /too short/],
    ['a file with the wrong magic', () => { const b = encodeVmesh(quad()); new DataView(b).setUint32(0, 0x12345678, true); return b; }, /not a mesh file/],
    ['an unsupported version', () => { const b = encodeVmesh(quad()); new DataView(b).setUint32(4, 9, true); return b; }, /unsupported version/],
    ['a truncated file', () => encodeVmesh(quad()).slice(0, 60), /does not match/],
    ['a file with extra bytes', () => { const b = encodeVmesh(quad()); const o = new Uint8Array(b.byteLength + 4); o.set(new Uint8Array(b)); return o.buffer; }, /does not match/],
    ['an index outside the vertices', () => { const b = encodeVmesh(quad()); const at = b.byteLength - 12; new DataView(b).setUint16(at, 99, true); return b; }, /outside the vertices/],
    ['zero vertices', () => { const b = encodeVmesh(quad()); new DataView(b).setUint32(8, 0, true); return b; }, /invalid counts/],
    ['an index count that is not whole triangles', () => { const b = encodeVmesh(quad()); new DataView(b).setUint32(12, 5, true); return b; }, /invalid counts/],
    ['a NaN position', () => { const b = encodeVmesh(quad()); new Float32Array(b, 20, 1)[0] = Number.NaN; return b; }, /finite/],
  ])('refuses %s', (_name, make, message) => {
    expect(() => decodeVmesh(make())).toThrow(message);
  });

  it('rejects an inconsistent mesh at encode time', () => {
    expect(() => encodeVmesh({ position: new Float32Array(9), normal: new Int8Array(6), index: new Uint16Array([0, 1, 2]) })).toThrow(/inconsistent/);
    expect(() => encodeVmesh({ position: new Float32Array(9), normal: new Int8Array(9), index: new Uint16Array([0, 1]) })).toThrow(/inconsistent/);
    expect(VMESH_MAGIC).toBe(0x48534d56);
  });
});
