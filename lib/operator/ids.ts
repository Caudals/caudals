import { randomBytes } from "node:crypto";

const crockfordBase32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(timeMs: number) {
  let value = Math.max(0, Math.floor(timeMs));
  let encoded = "";

  for (let index = 0; index < 10; index += 1) {
    encoded = crockfordBase32[value % 32] + encoded;
    value = Math.floor(value / 32);
  }

  return encoded;
}

function encodeRandom(bytes: Buffer) {
  let encoded = "";

  for (const byte of bytes) {
    encoded += crockfordBase32[byte % 32];
  }

  return encoded;
}

export function createPrefixedId(prefix: string) {
  return `${prefix}_${encodeTime(Date.now())}${encodeRandom(randomBytes(16))}`;
}
