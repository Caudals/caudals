import { DOCX_TYPE, extractDocx } from './docx';
export const MAX_SOURCE_BYTES = 1024 * 1024;
export const TEXT_TYPES = ['text/plain', 'text/markdown', DOCX_TYPE] as const;

/** Bounded UTF-8 / DOCX text only; no rendering, macros or network access. */
export function extractText(bytes: Uint8Array, mediaType: string) {
  if (!TEXT_TYPES.includes(mediaType as typeof TEXT_TYPES[number])) throw new Error('Unsupported document format');
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) throw new Error('Source size out of bounds');
  const text = mediaType === DOCX_TYPE ? extractDocx(bytes) : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) || /<\s*(?:!doctype|html|script|iframe)\b/i.test(text)) throw new Error('Not a supported text document');
  const chunks = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + 4096, text.length);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push({ ordinal: chunks.length, excerpt: text.slice(offset, end), anchor: { kind: 'character_range', start: offset, end, unit: 'utf16_code_unit' } });
    offset = end;
  }
  return { extractionVersion: mediaType === DOCX_TYPE ? 'docx-text-v1' : 'utf8-text-v1', chunks };
}
