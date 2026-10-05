/**
 * Solves the demo's proof-of-work challenge (lib/demo/pow.ts) off the main
 * thread. The message `${salt}:${nonce}` always fits one SHA-256 block, so
 * the worker runs a single compression and checks the first word only, which
 * is all a challenge of at most 32 bits needs.
 */

/** First 32-bit word of SHA-256 for an ASCII message shorter than 56 bytes. */
export function firstWord(message: string): number {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const w = new Array<number>(64).fill(0);
  const bytes = new Array<number>(64).fill(0);
  for (let i = 0; i < message.length; i++) bytes[i] = message.charCodeAt(i) & 0xff;
  bytes[message.length] = 0x80;
  const bits = message.length * 8;
  bytes[62] = (bits >>> 8) & 0xff;
  bytes[63] = bits & 0xff;
  for (let i = 0; i < 16; i++) w[i] = (bytes[i * 4] << 24) | (bytes[i * 4 + 1] << 16) | (bytes[i * 4 + 2] << 8) | bytes[i * 4 + 3];
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 16; i < 64; i++) {
    const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
    const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = 0x6a09e667, b = 0xbb67ae85, c = 0x3c6ef372, d = 0xa54ff53a, e = 0x510e527f, f = 0x9b05688c, g = 0x1f83d9ab, h = 0x5be0cd19;
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
  }
  return (0x6a09e667 + a) >>> 0;
}

export function search(salt: string, bits: number, from = 0, count = Number.MAX_SAFE_INTEGER): number | null {
  const shift = 32 - bits;
  for (let nonce = from; nonce < from + count; nonce++) {
    if (firstWord(`${salt}:${nonce}`) >>> shift === 0) return nonce;
  }
  return null;
}

const WORKER_SOURCE = `${firstWord.toString()}\n${search.toString()}\nonmessage = (event) => { postMessage(search(event.data.salt, event.data.bits)); };`;

/** Finds a nonce in a worker; falls back to small main-thread slices where workers are unavailable. */
export function solveChallenge(salt: string, bits: number): Promise<string> {
  if (!/^[0-9a-f]{32}$/.test(salt) || bits < 1 || bits > 32) return Promise.reject(new Error("challenge_invalid"));
  if (typeof Worker !== "undefined" && typeof Blob !== "undefined") {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
      return new Promise((resolve, reject) => {
        const worker = new Worker(url);
        worker.onmessage = (event: MessageEvent<number | null>) => {
          worker.terminate();
          URL.revokeObjectURL(url);
          if (typeof event.data === "number") resolve(String(event.data));
          else reject(new Error("challenge_invalid"));
        };
        worker.onerror = () => { worker.terminate(); URL.revokeObjectURL(url); resolveOnMainThread(salt, bits).then(resolve, reject); };
        worker.postMessage({ salt, bits });
      });
    } catch { /* blocked by a content security policy: solve here */ }
  }
  return resolveOnMainThread(salt, bits);
}

function resolveOnMainThread(salt: string, bits: number): Promise<string> {
  return new Promise((resolve) => {
    let from = 0;
    const step = () => {
      const found = search(salt, bits, from, 20_000);
      if (found !== null) resolve(String(found));
      else { from += 20_000; setTimeout(step, 0); }
    };
    step();
  });
}
