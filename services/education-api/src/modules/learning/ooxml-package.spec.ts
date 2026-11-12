import { deflateRawSync } from 'node:zlib';
import { validateDocxPackage, type RangeReader } from './ooxml-package';

type Part = { name: string; data: string | Buffer; method?: 0 | 8; flags?: number; uncompressedOverride?: number; compressedOverride?: number };

/** Builds a real ZIP in memory (local headers + central directory + EOCD) so the validator sees genuine bytes. */
function zip(parts: Part[], eocd: { zip64?: boolean } = {}): Buffer {
  const locals: Buffer[] = []; const centrals: Buffer[] = []; let offset = 0;
  for (const part of parts) {
    const raw = Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data);
    const method = part.method ?? 8;
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const name = Buffer.from(part.name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(part.flags ?? 0, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(part.flags ?? 0, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(part.compressedOverride ?? body.length, 20); central.writeUInt32LE(part.uncompressedOverride ?? raw.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, body); centrals.push(central, name); offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(eocd.zip64 ? 0xffff : parts.length, 8); end.writeUInt16LE(eocd.zip64 ? 0xffff : parts.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
const reader = (bytes: Buffer): RangeReader => async (start, end) => (start < 0 || end >= bytes.length ? null : new Uint8Array(bytes.subarray(start, end + 1)));
const CONTENT_TYPES = '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS = '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const valid = (): Part[] => [{ name: '[Content_Types].xml', data: CONTENT_TYPES }, { name: '_rels/.rels', data: RELS }, { name: 'word/document.xml', data: '<w:document/>' }];
const run = (parts: Part[], opts?: { zip64?: boolean }) => { const bytes = zip(parts, opts); return validateDocxPackage(bytes.length, reader(bytes)); };

describe('validateDocxPackage', () => {
  it('accepts a well-formed Word package (deflated and stored parts)', async () => {
    await expect(run(valid())).resolves.toEqual({ ok: true });
    await expect(run(valid().map((p) => ({ ...p, method: 0 as const })))).resolves.toEqual({ ok: true });
  });
  it.each([
    ['a generic ZIP with no Word parts', [{ name: 'readme.txt', data: 'hi' }]],
    ['a package without word/document.xml', valid().slice(0, 2)],
    ['a package whose content types do not declare a Word main part', [{ name: '[Content_Types].xml', data: '<Types/>' }, valid()[1], valid()[2]]],
    ['a spreadsheet package', [{ name: '[Content_Types].xml', data: CONTENT_TYPES.replace('wordprocessingml.document', 'spreadsheetml.sheet') }, valid()[1], valid()[2]]],
    ['a macro-enabled document (content type)', [{ name: '[Content_Types].xml', data: CONTENT_TYPES + '<Override ContentType="application/vnd.ms-word.document.macroEnabled.main+xml"/>' }, valid()[1], valid()[2]]],
    ['a package with a VBA payload', [...valid(), { name: 'word/vbaProject.bin', data: 'x' }]],
    ['a package with ActiveX controls', [...valid(), { name: 'word/activeX/activeX1.xml', data: 'x' }]],
    ['path traversal in a part name', [...valid(), { name: '../evil.xml', data: 'x' }]],
    ['an absolute part name', [...valid(), { name: '/etc/passwd', data: 'x' }]],
    ['a backslash part name', [...valid(), { name: 'a\\b.xml', data: 'x' }]],
    ['duplicate part names', [...valid(), { name: 'WORD/document.xml', data: 'x' }]],
    ['encrypted parts', [{ ...valid()[0], flags: 1 }, valid()[1], valid()[2]]],
    ['a missing relationship to the office document', [valid()[0], { name: '_rels/.rels', data: '<Relationships/>' }, valid()[2]]],
  ])('rejects %s', async (name, parts) => {
    const verdict = await run(parts as Part[]);
    expect(verdict.ok).toBe(false);
  });
  it('rejects ZIP64, a suspicious compression ratio and a total size bomb without decompressing them', async () => {
    expect((await run(valid(), { zip64: true })).ok).toBe(false);
    const ratio = await run([...valid(), { name: 'word/media/bomb.bin', data: 'x', compressedOverride: 10, uncompressedOverride: 50 * 1024 * 1024 }]);
    expect(ratio.ok).toBe(false);
    const total = await run([...valid(), { name: 'a.bin', data: 'x', compressedOverride: 4_000_000, uncompressedOverride: 400 * 1024 * 1024 }, { name: 'b.bin', data: 'x', compressedOverride: 4_000_000, uncompressedOverride: 400 * 1024 * 1024 }]);
    expect(total.ok).toBe(false);
  });
  it('rejects files that are not ZIP packages, truncated packages and tiny files', async () => {
    const text = Buffer.from('PK\u0003\u0004 this is plain text pretending to be a docx '.repeat(4));
    expect((await validateDocxPackage(text.length, reader(text))).ok).toBe(false);
    const whole = zip(valid()); const truncated = whole.subarray(0, whole.length - 30);
    expect((await validateDocxPackage(truncated.length, reader(truncated))).ok).toBe(false);
    expect((await validateDocxPackage(10, reader(Buffer.alloc(10)))).ok).toBe(false);
  });
  it('fails closed when storage cannot return a range', async () => {
    const bytes = zip(valid());
    expect((await validateDocxPackage(bytes.length, async () => null)).ok).toBe(false);
  });
});
