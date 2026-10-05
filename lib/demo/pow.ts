import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hmac } from "./client";

/**
 * A small proof of work instead of a CAPTCHA: the browser finds a nonce whose
 * SHA-256 with the challenge salt starts with `bits` zero bits (about half a
 * second in a worker), while the visitor is still typing. It makes scripted
 * runs cost CPU per attempt without a third-party widget or tracking. The
 * challenge is signed, bound to the visitor key and expires; a solved one is
 * recorded so it cannot be replayed.
 */
export const POW_BITS = 18;
const TTL_MS = 10 * 60_000;

export type Challenge = { salt: string; bits: number; expires: number; signature: string };

export function issueChallenge(client: string, now = Date.now()): Challenge {
  const salt = randomBytes(16).toString("hex");
  const expires = now + TTL_MS;
  return { salt, bits: POW_BITS, expires, signature: hmac(`pow:${salt}:${POW_BITS}:${expires}:${client}`) };
}

export function leadingZeroBits(digest: Buffer) {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) { bits += 8; continue; }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Checks signature, expiry and work. Returns the digest to record as spent, or null. */
export function verifyChallenge(challenge: Challenge, nonce: string, client: string, now = Date.now()): string | null {
  if (!/^[0-9a-f]{32}$/.test(challenge.salt) || !/^[0-9]{1,12}$/.test(nonce) || challenge.bits !== POW_BITS) return null;
  if (!Number.isSafeInteger(challenge.expires) || challenge.expires < now) return null;
  const expected = Buffer.from(hmac(`pow:${challenge.salt}:${challenge.bits}:${challenge.expires}:${client}`), "hex");
  const given = Buffer.from(/^[0-9a-f]{64}$/.test(challenge.signature) ? challenge.signature : "", "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const digest = createHash("sha256").update(`${challenge.salt}:${nonce}`).digest();
  if (leadingZeroBits(digest) < challenge.bits) return null;
  return createHash("sha256").update(`spent:${challenge.salt}`).digest("hex");
}
