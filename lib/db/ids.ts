import "server-only";

import { randomBytes } from "crypto";

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const BASE32_RADIX = BigInt(32);

function encodeTime(ms: number) {
  let value = BigInt(ms);
  const chars = Array.from({ length: 10 }, () => "0");

  for (let index = chars.length - 1; index >= 0; index -= 1) {
    chars[index] = CROCKFORD_BASE32[Number(value % BASE32_RADIX)];
    value /= BASE32_RADIX;
  }

  return chars.join("");
}

function encodeRandom() {
  let value = BigInt(`0x${randomBytes(10).toString("hex")}`);
  const chars = Array.from({ length: 16 }, () => "0");

  for (let index = chars.length - 1; index >= 0; index -= 1) {
    chars[index] = CROCKFORD_BASE32[Number(value % BASE32_RADIX)];
    value /= BASE32_RADIX;
  }

  return chars.join("");
}

export function generatePrefixedUlid(prefix: string, date = new Date()) {
  if (!/^[a-z]{2}$/.test(prefix)) {
    throw new Error("ID prefix must be two lowercase letters");
  }

  return `${prefix}_${encodeTime(date.getTime())}${encodeRandom()}`;
}
