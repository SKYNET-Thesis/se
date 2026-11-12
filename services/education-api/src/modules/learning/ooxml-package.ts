import { inflateRawSync } from 'node:zlib';

/**
 * Structural validation of a DOCX (OOXML) package from ranged reads only: the object is never loaded whole.
 *
 * What it proves: the file is a well-formed, non-encrypted, non-ZIP64 ZIP whose central directory is sane
 * (bounded entry count, no path traversal, no duplicate names, no zip-bomb ratios) and which carries the OPC
 * parts of a Word document ([Content_Types].xml declaring the WordprocessingML main part, _rels/.rels pointing
 * at an office document, word/document.xml) and no VBA/ActiveX payload.
 *
 * What it does NOT prove: it is not malware scanning. It cannot detect exploit content inside an otherwise valid
 * part, malicious hyperlinks/external relationships, or embedded OLE objects. Downloads are always served as
 * attachments for that reason.
 */
export type RangeReader = (start: number, endInclusive: number) => Promise<Uint8Array | null>;
export type OoxmlVerdict = { ok: true } | { ok: false; reason: string };

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRIES = 5000;
const MAX_CENTRAL_DIRECTORY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_RATIO = 200;
const MAX_XML_PART_BYTES = 256 * 1024;
const WORD_MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const FORBIDDEN_PART = /(^|\/)(vbaProject\.bin|vbaData\.xml|activeX\/)/i;

type Entry = { name: string; flags: number; method: number; compressed: number; uncompressed: number; localOffset: number };

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const fail = (reason: string): OoxmlVerdict => ({ ok: false, reason });

export async function validateDocxPackage(size: number, read: RangeReader): Promise<OoxmlVerdict> {
  if (!Number.isSafeInteger(size) || size < 22) return fail('The file is too small to be a DOCX package.');
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = await read(size - tailLength, size - 1);
  if (!tail || tail.length !== tailLength) return fail('The package end could not be read.');
  const tailView = view(tail);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tailView.getUint32(i, true) === EOCD_SIGNATURE && i + 22 + tailView.getUint16(i + 20, true) === tail.length) { eocd = i; break; }
  }
  if (eocd < 0) return fail('The file is not a ZIP package.');
  const entryCount = tailView.getUint16(eocd + 10, true);
  const directorySize = tailView.getUint32(eocd + 12, true);
  const directoryOffset = tailView.getUint32(eocd + 16, true);
  if (tailView.getUint16(eocd + 4, true) !== 0 || tailView.getUint16(eocd + 6, true) !== 0) return fail('Multi-disk ZIP packages are not supported.');
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) return fail('ZIP64 packages are not supported.');
  if (entryCount === 0 || entryCount > MAX_ENTRIES) return fail('The package has an unsupported number of parts.');
  if (directorySize > MAX_CENTRAL_DIRECTORY_BYTES || directoryOffset + directorySize > size) return fail('The package directory is invalid.');
  const directory = await read(directoryOffset, directoryOffset + directorySize - 1);
  if (!directory || directory.length !== directorySize) return fail('The package directory could not be read.');
  const dv = view(directory);

  const entries = new Map<string, Entry>();
  let cursor = 0;
  let total = 0;
  for (let n = 0; n < entryCount; n++) {
    if (cursor + 46 > directory.length || dv.getUint32(cursor, true) !== CENTRAL_SIGNATURE) return fail('The package directory is corrupt.');
    const flags = dv.getUint16(cursor + 8, true);
    const method = dv.getUint16(cursor + 10, true);
    const compressed = dv.getUint32(cursor + 20, true);
    const uncompressed = dv.getUint32(cursor + 24, true);
    const nameLength = dv.getUint16(cursor + 28, true);
    const extraLength = dv.getUint16(cursor + 30, true);
    const commentLength = dv.getUint16(cursor + 32, true);
    const localOffset = dv.getUint32(cursor + 42, true);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > directory.length) return fail('The package directory is corrupt.');
    const name = new TextDecoder('utf-8', { fatal: false }).decode(directory.subarray(cursor + 46, cursor + 46 + nameLength));
    if (flags & 0x1) return fail('Encrypted packages are not supported.');
    if (compressed === 0xffffffff || uncompressed === 0xffffffff || localOffset === 0xffffffff) return fail('ZIP64 packages are not supported.');
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || /[\u0000-\u001f]/.test(name)) return fail('The package contains an unsafe part name.');
    if (entries.has(name.toLowerCase())) return fail('The package contains duplicate part names.');
    if (FORBIDDEN_PART.test(name)) return fail('Macro-enabled or ActiveX content is not allowed.');
    if (method !== 0 && method !== 8) return fail('The package uses an unsupported compression method.');
    if (uncompressed > 1024 * 1024 && compressed > 0 && uncompressed / compressed > MAX_ENTRY_RATIO) return fail('The package has a suspicious compression ratio.');
    total += uncompressed;
    if (total > MAX_TOTAL_UNCOMPRESSED_BYTES) return fail('The package expands to an unsupported size.');
    if (localOffset + 30 > size) return fail('The package directory is corrupt.');
    entries.set(name.toLowerCase(), { name, flags, method, compressed, uncompressed, localOffset });
    cursor = end;
  }

  for (const required of ['[content_types].xml', '_rels/.rels', 'word/document.xml']) {
    if (!entries.has(required)) return fail('The file is not a Word (DOCX) package.');
  }

  const readPart = async (entry: Entry): Promise<string | null> => {
    if (entry.compressed > MAX_XML_PART_BYTES || entry.uncompressed > MAX_XML_PART_BYTES) return null;
    const header = await read(entry.localOffset, entry.localOffset + 29);
    if (!header || header.length !== 30 || view(header).getUint32(0, true) !== LOCAL_SIGNATURE) return null;
    const hv = view(header);
    const dataStart = entry.localOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    if (entry.compressed === 0) return '';
    if (dataStart + entry.compressed > size) return null;
    const data = await read(dataStart, dataStart + entry.compressed - 1);
    if (!data || data.length !== entry.compressed) return null;
    try {
      const raw = entry.method === 0 ? Buffer.from(data) : inflateRawSync(Buffer.from(data), { maxOutputLength: MAX_XML_PART_BYTES });
      return raw.toString('utf8');
    } catch { return null; }
  };

  const contentTypes = await readPart(entries.get('[content_types].xml')!);
  if (contentTypes === null) return fail('The package content types could not be read.');
  if (!contentTypes.includes(WORD_MAIN)) return fail('The package does not declare a Word document part.');
  if (/macroEnabled|vbaProject/i.test(contentTypes)) return fail('Macro-enabled documents are not allowed.');
  const rels = await readPart(entries.get('_rels/.rels')!);
  if (rels === null || !/relationships\/officeDocument["']/.test(rels) || !/word\/document\.xml/.test(rels)) return fail('The package does not reference a Word document.');
  return { ok: true };
}
