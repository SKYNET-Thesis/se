import { matchesDeclaredFormat } from './learning-media.signature';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string, offset = 0) => { const out = new Uint8Array(16); [...value].forEach((c, i) => { out[offset + i] = c.charCodeAt(0); }); return out; };

describe('upload content verification', () => {
  const ok: Array<[string, Uint8Array]> = [
    ['application/pdf', text('%PDF-1.7')], ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes(0x50, 0x4b, 3, 4, 0)],
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', bytes(0x50, 0x4b, 3, 4, 0)],
    ['image/webp', (() => { const out = text('RIFF'); [...'WEBP'].forEach((c, i) => { out[8 + i] = c.charCodeAt(0); }); return out; })()],
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)], ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['video/mp4', text('ftyp', 4)], ['video/quicktime', text('moov', 4)], ['video/webm', bytes(0x1a, 0x45, 0xdf, 0xa3)],
    ['audio/mpeg', text('ID3')], ['audio/mpeg', bytes(0xff, 0xfb, 0x90, 0x00)],
  ];
  it.each(ok)('accepts genuine %s content', (mime, data) => { expect(matchesDeclaredFormat(mime, data)).toBe(true); });
  it('rejects an executable, HTML, or a different format presented as each type', () => {
    const exe = bytes(0x4d, 0x5a, 0x90, 0x00); const html = text('<!doctype html>'); const elf = bytes(0x7f, 0x45, 0x4c, 0x46);
    for (const [mime] of ok) for (const data of [exe, html, elf]) expect(matchesDeclaredFormat(mime, data)).toBe(false);
    expect(matchesDeclaredFormat('image/png', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(false);
    expect(matchesDeclaredFormat('image/webp', text('RIFF'))).toBe(false); // RIFF container but not WEBP (e.g. WAV/AVI)
    expect(matchesDeclaredFormat('audio/mpeg', text('ftyp', 4))).toBe(false);
    expect(matchesDeclaredFormat('video/mp4', text('ID3'))).toBe(false);
  });
  it('rejects empty/short objects and unknown types', () => {
    expect(matchesDeclaredFormat('audio/mpeg', bytes())).toBe(false);
    expect(matchesDeclaredFormat('audio/mpeg', bytes(0xff))).toBe(false);
    expect(matchesDeclaredFormat('application/x-msdownload', text('MZ'))).toBe(false);
  });
});
