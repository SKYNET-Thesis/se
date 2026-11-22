import { describe, expect, it } from 'vitest';
import { csvSyntaxMessage, isBlankRecord, readCsv } from './csv';

const cells = (source: string) => {
  const result = readCsv(source);
  if (!result.ok) throw new Error(`unexpected ${result.error.kind} on line ${result.error.line}`);
  return result.records.map((record) => record.cells);
};
const error = (source: string) => { const result = readCsv(source); return result.ok ? null : result.error; };

describe('readCsv (RFC 4180)', () => {
  it('reads plain fields, empty fields and trailing empty fields', () => {
    expect(cells('a,b,c\n1,,3\n4,5,\n')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['4', '5', '']]);
    expect(cells(',,')).toEqual([['', '', '']]);
  });

  it('keeps commas, line breaks and doubled quotes inside quoted fields', () => {
    expect(cells('name,code\n"Nguyen, Van An",S1\n"Le ""Bee"" Han",S2\n')).toEqual([['name', 'code'], ['Nguyen, Van An', 'S1'], ['Le "Bee" Han', 'S2']]);
    expect(cells('note,code\n"line one\nline two",S3')).toEqual([['note', 'code'], ['line one\nline two', 'S3']]);
    expect(cells('a,b\n"",x\n" ",y')).toEqual([['a', 'b'], ['', 'x'], [' ', 'y']]);
  });

  it('accepts CRLF, LF and lone CR line endings, a byte-order mark, and no final newline', () => {
    const expected = [['a', 'b'], ['1', '2'], ['3', '4']];
    expect(cells('a,b\r\n1,2\r\n3,4\r\n')).toEqual(expected);
    expect(cells('a,b\n1,2\n3,4')).toEqual(expected);
    expect(cells('a,b\r1,2\r3,4')).toEqual(expected);
    expect(cells(String.fromCharCode(0xfeff) + 'a,b\n1,2\n3,4')).toEqual(expected);
    expect(cells('a,b\r\n"x\r\ny",2')).toEqual([['a', 'b'], ['x\r\ny', '2']]);
  });

  it('allows spaces around a quoted field, as some spreadsheets write them', () => {
    expect(cells('a,b\n  "Nguyen, An"  ,S1')).toEqual([['a', 'b'], ['Nguyen, An', 'S1']]);
  });

  it('reports malformed quoting with the line, instead of guessing a split', () => {
    expect(error('a,b\n"Nguyen, An,S1\n3,4')).toEqual({ kind: 'unclosed-quote', line: 2 });
    expect(error('a,b\nNguy"en,S1')).toEqual({ kind: 'stray-quote', line: 2 });
    expect(error('a,b\n"Nguyen"An,S1')).toEqual({ kind: 'text-after-quote', line: 2 });
    expect(error('a,b\n"Nguyen""",S1\n"x"y,1')).toEqual({ kind: 'text-after-quote', line: 3 }); // "" is a literal quote, then a proper close
    expect(error('a,b\n"multi\nline",ok\nbad"quote,1')).toEqual({ kind: 'stray-quote', line: 4 }); // line numbers count lines inside quotes
    expect(csvSyntaxMessage({ kind: 'unclosed-quote', line: 2 })).toContain('starts on line 2 is never closed');
  });

  it('marks blank and comma-only records so callers can skip them', () => {
    const result = readCsv('a,b\n\n , \n1,2');
    expect(result.ok && result.records.map(isBlankRecord)).toEqual([false, true, true, false]);
  });
});
