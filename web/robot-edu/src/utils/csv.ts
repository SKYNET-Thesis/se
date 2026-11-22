/**
 * RFC 4180 CSV reader for the school import files (no dependency). A field is either plain text or wrapped in double
 * quotes; inside quotes, commas and line breaks are part of the value and `""` is a literal quote. Records end at
 * CRLF, LF or a lone CR. A leading UTF-8 byte-order mark is ignored.
 *
 * It never guesses: a quote that opens and is not closed, a quote inside an unquoted value, or text after a closing
 * quote is reported with its line, instead of being read as some other split of the data.
 */
export type CsvRecord = { cells: string[]; line: number };
export type CsvSyntaxError =
  | { kind: 'unclosed-quote'; line: number }
  | { kind: 'stray-quote'; line: number }
  | { kind: 'text-after-quote'; line: number };

export function readCsv(source: string): { ok: true; records: CsvRecord[] } | { ok: false; error: CsvSyntaxError } {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const records: CsvRecord[] = [];
  let cells: string[] = []; let field = ''; let line = 1; let recordLine = 1;
  let quoted = false; let quoteLine = 1; let closedQuote = false;
  const endField = () => { cells.push(field); field = ''; closedQuote = false; };
  const endRecord = () => { endField(); records.push({ cells, line: recordLine }); cells = []; };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; closedQuote = true; }
      } else {
        if (char === '\n' || (char === '\r' && text[i + 1] !== '\n')) line += 1;
        field += char;
      }
      continue;
    }
    if (char === ',') { endField(); continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      endRecord(); line += 1; recordLine = line;
      continue;
    }
    if (char === '"') {
      // A quote may only open a field (spaces before it are allowed, as spreadsheets sometimes write them).
      if (closedQuote) return { ok: false, error: { kind: 'text-after-quote', line } };
      if (field.trim() !== '') return { ok: false, error: { kind: 'stray-quote', line } };
      quoted = true; quoteLine = line; field = '';
      continue;
    }
    if (closedQuote) {
      if (char.trim() === '') continue; // spaces after a closing quote are ignored
      return { ok: false, error: { kind: 'text-after-quote', line } };
    }
    field += char;
  }
  if (quoted) return { ok: false, error: { kind: 'unclosed-quote', line: quoteLine } };
  if (field !== '' || cells.length > 0 || closedQuote) endRecord();
  return { ok: true, records };
}

/** True when every cell is empty or whitespace, e.g. a blank line or a spreadsheet row of commas. */
export const isBlankRecord = (record: CsvRecord) => record.cells.every((cell) => cell.trim() === '');

export function csvSyntaxMessage(error: CsvSyntaxError) {
  switch (error.kind) {
    case 'unclosed-quote': return `A quotation mark that starts on line ${error.line} is never closed. Check that value, then choose the file again.`;
    case 'stray-quote': return `Line ${error.line} has a quotation mark inside a value. Wrap that value in quotation marks and write the quote twice (""), or save the file again from your spreadsheet.`;
    case 'text-after-quote': return `Line ${error.line} has text right after a closing quotation mark. Put the whole value inside the quotation marks, then choose the file again.`;
  }
}
