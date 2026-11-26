import { deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * Question Bank bulk-import parsing (CSV / XLSX). Pure functions: no database access, no I/O.
 * This is unrelated to the school user CSV import. XLSX is read with a small bounded ZIP reader (no new dependency,
 * no formula evaluation, no macros, no external references) — only cell values of the first worksheet are read.
 */
export const IMPORT_MAX_BYTES = 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;
export const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
/** Default points when the file gives none (owner decision 2026-11-26). An explicit points value is always preserved. */
export const DEFAULT_POINTS_BY_DIFFICULTY: Record<string, number> = { easy: 1, medium: 2, hard: 3 };
export const TEMPLATE_HEADERS = ['code', 'type', 'difficulty', 'cognitive_level', 'stem', ...OPTION_LETTERS.map((l) => `option_${l}`), 'correct', 'points', 'explanation', 'source_reference', 'course', 'lesson', 'learning_section', 'topic', 'learning_objective'];

export type ImportedContent = {
  type: 'single_choice' | 'multiple_choice' | 'true_false'; difficulty: string; cognitiveLevel: string; stem: string;
  options: Array<{ id: string; text: string }>; answerKey: string[]; explanation: string; sourceReference?: string;
};
export type RowMapping = { course?: string; lesson?: string; learningSection?: string; topic?: string; learningObjective?: string };
export type ParsedRow = { rowNumber: number; code?: string; points?: number; pointsSource?: 'file' | 'default'; mapping: RowMapping; content?: ImportedContent; errors: string[]; duplicateOfRow?: number };
export class ImportFileError extends Error {}

const DIFFICULTY = ['easy', 'medium', 'hard'];
const COGNITIVE = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += ch;
  }
  if (quoted) throw new ImportFileError('CSV has an unterminated quoted field.');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n') + '\r\n';
}

// ---- minimal ZIP/XLSX ----
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf: Buffer): number { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name); const comp = deflateRawSync(e.data); const crc = crc32(e.data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(8, 10);
    head.writeUInt32LE(crc, 16); head.writeUInt32LE(comp.length, 20); head.writeUInt32LE(e.data.length, 24); head.writeUInt16LE(name.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, name, comp); central.push(head, name); offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlUnescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const colName = (i: number) => String.fromCharCode(65 + i);

export function buildXlsx(rows: string[][]): Buffer {
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(c)}</t></is></c>`).join('')}</row>`).join('');
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`) },
  ]);
}

const MAX_ZIP_ENTRIES = 200;
const MAX_PART_BYTES = 8 * 1024 * 1024;

function readZip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new ImportFileError('The file is not a valid XLSX workbook.');
  const count = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ZIP_ENTRIES) throw new ImportFileError('The workbook contains too many parts.');
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new ImportFileError('The file is not a valid XLSX workbook.');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString('utf8'); p += 46 + nlen + elen + clen;
    if (flags & 1) throw new ImportFileError('Encrypted workbooks are not supported.');
    if (!/^(xl\/(workbook|sharedStrings|worksheets\/sheet\d+)\.xml|xl\/_rels\/workbook\.xml\.rels)$/.test(name)) continue;
    if (usize > MAX_PART_BYTES) throw new ImportFileError('The workbook is too large.');
    if (lo + 30 > buf.length || buf.readUInt32LE(lo) !== 0x04034b50) throw new ImportFileError('The file is not a valid XLSX workbook.');
    const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
    const raw = buf.subarray(start, start + csize);
    try { out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: MAX_PART_BYTES })); } catch { throw new ImportFileError('The workbook could not be read.'); }
  }
  return out;
}

const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlUnescape(m[1])).join('');

export function parseXlsx(buf: Buffer): string[][] {
  const parts = readZip(buf);
  const sheet = parts.get('xl/worksheets/sheet1.xml') ?? [...parts.entries()].filter(([n]) => n.startsWith('xl/worksheets/')).sort(([a], [b]) => a.localeCompare(b))[0]?.[1];
  if (!sheet || !parts.has('xl/workbook.xml')) throw new ImportFileError('The file is not a valid XLSX workbook.');
  const shared = [...(parts.get('xl/sharedStrings.xml')?.toString('utf8') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const rows: string[][] = [];
  for (const rm of sheet.toString('utf8').matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /r="([A-Z]+)\d+"/.exec(cm[1])?.[1]; const type = /t="(\w+)"/.exec(cm[1])?.[1]; const body = cm[2] ?? '';
      let col = 0; for (const ch of ref ?? '') col = col * 26 + ch.charCodeAt(0) - 64; col = ref ? col - 1 : row.length;
      if (col > 100) throw new ImportFileError('The worksheet has too many columns.');
      let value = '';
      if (type === 'inlineStr') value = textOf(body);
      else { const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]; value = v === undefined ? '' : type === 's' ? (shared[Number(v)] ?? '') : xmlUnescape(v); }
      while (row.length < col) row.push('');
      row[col] = value;
    }
    rows.push(row);
    if (rows.length > IMPORT_MAX_ROWS + 50) throw new ImportFileError(`At most ${IMPORT_MAX_ROWS} questions can be imported at once.`);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function readImportTable(filename: string, buf: Buffer): string[][] {
  if (!buf.length) throw new ImportFileError('The file is empty.');
  if (buf.length > IMPORT_MAX_BYTES) throw new ImportFileError('The file is larger than 1 MB.');
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx')) return parseXlsx(buf);
  if (lower.endsWith('.csv')) return parseCsv(buf.toString('utf8'));
  throw new ImportFileError('Only .csv and .xlsx files are supported.');
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, '_');
export const normalizeStem = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Maps a table (first row = header) to validated rows. Never throws for row-level problems. */
export function parseQuestionRows(table: string[][]): ParsedRow[] {
  if (table.length < 2) throw new ImportFileError('The file needs a header row and at least one question.');
  if (table.length - 1 > IMPORT_MAX_ROWS) throw new ImportFileError(`At most ${IMPORT_MAX_ROWS} questions can be imported at once.`);
  const header = table[0].map(norm);
  for (const required of ['type', 'stem', 'correct']) if (!header.includes(required)) throw new ImportFileError(`Missing required column "${required}".`);
  if (!header.includes('option_a') || !header.includes('option_b')) { if (!table.slice(1).every((cells) => norm(cells[header.indexOf('type')] ?? '') === 'true_false')) throw new ImportFileError('Missing required column "option_a" / "option_b".'); }
  const idx = (name: string) => header.indexOf(name);
  const seen = new Map<string, number>();
  return table.slice(1).map((cells, i): ParsedRow => {
    const rowNumber = i + 2; const get = (n: string) => (idx(n) >= 0 ? (cells[idx(n)] ?? '').trim() : '');
    const errors: string[] = [];
    const type = norm(get('type'));
    if (type !== 'single_choice' && type !== 'multiple_choice' && type !== 'true_false') errors.push('type must be single_choice, multiple_choice or true_false.');
    const difficulty = norm(get('difficulty')) || 'medium';
    if (!DIFFICULTY.includes(difficulty)) errors.push('difficulty must be easy, medium or hard.');
    const cognitiveLevel = norm(get('cognitive_level')) || 'understand';
    if (!COGNITIVE.includes(cognitiveLevel)) errors.push(`cognitive_level must be one of ${COGNITIVE.join(', ')}.`);
    const stem = get('stem');
    if (!stem) errors.push('stem is required.'); else if (stem.length > 10000) errors.push('stem is too long.');
    const isTrueFalse = type === 'true_false';
    const options = isTrueFalse ? [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] : OPTION_LETTERS.map((l) => ({ id: l, text: get(`option_${l}`) })).filter((o) => o.text !== '');
    if (isTrueFalse && OPTION_LETTERS.some((l) => get(`option_${l}`) !== '')) errors.push('true_false must not list options; leave option columns empty.');
    if (options.length < 2) errors.push('At least two options are required.');
    if (options.some((o) => o.text.length > 2000)) errors.push('An option is too long.');
    if (new Set(options.map((o) => o.text.toLowerCase())).size !== options.length) errors.push('Options must be distinct.');
    if (!isTrueFalse) for (let k = 0; k < OPTION_LETTERS.length; k++) if (options.some((o) => o.id === OPTION_LETTERS[k]) && k > 0 && !options.some((o) => o.id === OPTION_LETTERS[k - 1])) { errors.push('Options must be filled in order without gaps.'); break; }
    const TF_ALIASES: Record<string, string> = { true: 'true', t: 'true', yes: 'true', false: 'false', f: 'false', no: 'false' };
    const answerKey = get('correct').split(/[;,|\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean).map((a) => (isTrueFalse ? (TF_ALIASES[a] ?? a) : a));
    if (!answerKey.length) errors.push('correct is required.');
    else if (answerKey.some((a) => !options.some((o) => o.id === a))) errors.push('correct refers to an option that is empty or does not exist.');
    else if (new Set(answerKey).size !== answerKey.length) errors.push('correct lists an option twice.');
    else if ((type === 'single_choice' || isTrueFalse) && answerKey.length !== 1) errors.push(`${type} needs exactly one correct option.`);
    else if (type === 'multiple_choice' && answerKey.length < 2) errors.push('multiple_choice needs at least two correct options.');
    const explanation = get('explanation');
    if (!explanation) errors.push('explanation is required.');
    let points: number | undefined; let pointsSource: ParsedRow['pointsSource'];
    if (get('points')) { const n = Number(get('points')); if (!Number.isFinite(n) || n <= 0 || n > 1000 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-9) errors.push('points must be a positive number with at most 2 decimals.'); else { points = n; pointsSource = 'file'; } }
    else if (DIFFICULTY.includes(difficulty)) { points = DEFAULT_POINTS_BY_DIFFICULTY[difficulty]; pointsSource = 'default'; }
    const code = get('code') || undefined;
    if (code && code.length > 80) errors.push('code is too long.');
    const mapping: RowMapping = { course: get('course') || undefined, lesson: get('lesson') || undefined, learningSection: get('learning_section') || undefined, topic: get('topic') || undefined, learningObjective: get('learning_objective') || undefined };
    if (mapping.topic && mapping.topic.length > 200) errors.push('topic is too long.');
    const row: ParsedRow = { rowNumber, code, points, pointsSource, mapping, errors };
    if (stem) { const key = normalizeStem(stem); const first = seen.get(key); if (first !== undefined) row.duplicateOfRow = first; else seen.set(key, rowNumber); }
    if (!errors.length) row.content = { type: type as ImportedContent['type'], difficulty, cognitiveLevel, stem, options, answerKey, explanation, sourceReference: get('source_reference') || undefined };
    return row;
  });
}

export function templateTable(): string[][] {
  const blank = (n: number) => Array(n).fill('');
  // Columns: code,type,difficulty,cognitive_level,stem,option_a..f,correct,points,explanation,source_reference,course,lesson,learning_section,topic,learning_objective.
  // course/lesson/learning_section/learning_objective are optional cross-checks and are left blank in the samples so the template imports into any lesson.
  const tail = (topic: string) => ['', '', '', topic, ''];
  return [TEMPLATE_HEADERS,
    ['', 'single_choice', 'easy', 'remember', 'Which component stores the robot program?', 'Controller', 'Gripper', 'Camera', ...blank(3), 'A', '', 'The controller runs and stores the program.', '', ...tail('Robot safety')],
    ['', 'multiple_choice', 'medium', 'understand', 'Which are robot sensors?', 'Camera', 'Encoder', 'Battery case', 'Force sensor', '', '', 'A;B;D', '', 'Cameras, encoders and force sensors sense the environment.', 'Unit 1', ...tail('Sensing')],
    ['', 'true_false', 'hard', 'apply', 'The emergency stop may be released before the cause is fixed.', ...blank(6), 'false', '5', 'Never release a stop before the cause is cleared.', '', ...tail('Robot safety')],
  ];
}
