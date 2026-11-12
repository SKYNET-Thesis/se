/**
 * Lightweight content verification for uploads. The browser-declared MIME type and the file extension are not
 * trustworthy on their own, so the first bytes of the stored object must carry the format's magic number.
 *
 * Limits (documented on purpose): this proves the file *starts like* the claimed format. It is not malware
 * scanning, it cannot detect a polyglot or a macro inside an Office file, and DOCX/PPTX share the generic ZIP header.
 */
export const SIGNATURE_BYTES = 16;

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
const ascii = (bytes: Uint8Array, text: string, offset = 0) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

export function matchesDeclaredFormat(mime: string, bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  switch (mime) {
    case 'application/pdf': return ascii(bytes, '%PDF-');
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
    case 'image/png': return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg': return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case 'image/webp': return ascii(bytes, 'RIFF') && ascii(bytes, 'WEBP', 8);
    case 'video/mp4': return ascii(bytes, 'ftyp', 4);
    case 'video/quicktime': return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip'].some((atom) => ascii(bytes, atom, 4));
    case 'video/webm': return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case 'audio/mpeg': return ascii(bytes, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    default: return false;
  }
}
