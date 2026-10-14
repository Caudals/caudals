/**
 * The white-label logo a partner uploads (launch L-28): a PNG or JPEG of at
 * most 512 KB and 16–4,096 px a side, recognised from its bytes (never from
 * the name or the declared type). SVG and everything else are refused: the
 * logo is placed on report PDFs, so it must be a plain raster image.
 */
export const MAX_LOGO_BYTES = 512 * 1024;
export const LOGO_MEDIA_TYPES = ["image/png", "image/jpeg"] as const;
export type LogoMediaType = (typeof LOGO_MEDIA_TYPES)[number];
export type LogoInfo = { mediaType: LogoMediaType; width: number; height: number; bytes: number };

export class LogoError extends Error {
  constructor(public code: "LOGO_EMPTY" | "LOGO_TOO_LARGE" | "LOGO_TYPE" | "LOGO_DIMENSIONS") { super(code); }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return null;
  // The first chunk must be IHDR (length 13): width and height, big-endian.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) { offset += 1; continue; }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or start of scan before a frame header
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    // Start-of-frame markers (baseline, progressive, …) carry the size; C4, C8 and CC are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (length < 7) return null;
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

export function inspectLogo(bytes: Uint8Array): LogoInfo {
  if (!bytes.length) throw new LogoError("LOGO_EMPTY");
  if (bytes.length > MAX_LOGO_BYTES) throw new LogoError("LOGO_TOO_LARGE");
  const png = pngSize(bytes);
  const size = png ?? jpegSize(bytes);
  if (!size) throw new LogoError("LOGO_TYPE");
  if (size.width < 16 || size.height < 16 || size.width > 4096 || size.height > 4096) throw new LogoError("LOGO_DIMENSIONS");
  return { mediaType: png ? "image/png" : "image/jpeg", width: size.width, height: size.height, bytes: bytes.length };
}

/** Private object key for a partner's logo (evaluation store, sealed once). */
export function partnerLogoKey(partnerId: string, objectId: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!uuid.test(partnerId) || !uuid.test(objectId)) throw new Error("Invalid object scope");
  return `evals/partners/${partnerId}/logo/${objectId}`;
}
