import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import type { Keyring } from "./envelope";

const wireSchema = z.strictObject({ version: z.string().max(100), iv: z.string().max(40), tag: z.string().max(40), data: z.string().max(2_000_000) });
// Separate purpose-derived key; passwords, pixels and storage state are never
// plaintext on the app→relay→browser network or in persistent command queues.
function key(keys: Keyring, version: string) {
  const master = keys.get(version);
  if (!master) throw new Error("browser_control_denied");
  return createHmac("sha256", master).update("caudals-browser-control-v1").digest();
}
export function sealBrowserMessage(value: unknown, keys: Keyring, direction: "request" | "response", requestId: string) {
  const version = [...keys.keys()].sort().at(-1)!;
  const iv = randomBytes(12), secret = key(keys, version);
  try {
    const cipher = createCipheriv("aes-256-gcm", secret, iv);
    cipher.setAAD(Buffer.from(`${direction}:${requestId}`));
    const bytes = Buffer.from(JSON.stringify(value));
    try {
      const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
      return { version, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
    } finally { bytes.fill(0); }
  } finally { secret.fill(0); }
}
export function openBrowserMessage(raw: unknown, keys: Keyring, direction: "request" | "response", requestId: string): unknown {
  const wire = wireSchema.parse(raw), secret = key(keys, wire.version);
  let bytes: Buffer | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(wire.iv, "base64"));
    decipher.setAAD(Buffer.from(`${direction}:${requestId}`));
    decipher.setAuthTag(Buffer.from(wire.tag, "base64"));
    bytes = Buffer.concat([decipher.update(Buffer.from(wire.data, "base64")), decipher.final()]);
    return JSON.parse(bytes.toString("utf8"));
  } finally { secret.fill(0); bytes?.fill(0); }
}
