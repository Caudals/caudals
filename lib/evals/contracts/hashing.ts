import { createHash, timingSafeEqual } from "node:crypto";
import { hashSchema } from "./primitives";

/** RFC 8785 JSON subset: finite IEEE-754 numbers, Unicode scalar strings, plain JSON objects. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  function encode(input: unknown): string {
    if (input === null) return "null";
    if (typeof input === "boolean") return input ? "true" : "false";
    if (typeof input === "number") { if (!Number.isFinite(input)) throw new Error("Non-finite JSON number"); return JSON.stringify(input); }
    if (typeof input === "string") { if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(input)) throw new Error("Invalid Unicode scalar string"); return JSON.stringify(input); }
    if (typeof input !== "object" || active.has(input)) throw new Error("Not acyclic JSON");
    if (Object.getOwnPropertySymbols(input).length) throw new Error("Symbol keys are not JSON");
    active.add(input);
    let result: string;
    if (Array.isArray(input)) {
      if (Object.keys(input).length !== input.length) throw new Error("Sparse or decorated JSON array");
      const values: string[] = [];
      for (let i = 0; i < input.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(i));
        if (!descriptor || !("value" in descriptor)) throw new Error("Array accessors are not JSON");
        values.push(encode(descriptor.value));
      }
      result = `[${values.join(",")}]`;
    } else {
      if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) throw new Error("Not a plain JSON object");
      if (Object.getOwnPropertySymbols(input).length) throw new Error("Symbol keys are not JSON");
      result = `{${Object.keys(input).sort().map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
        if (!('value' in descriptor)) throw new Error("Accessors are not JSON");
        return `${encode(key)}:${encode(descriptor.value)}`;
      }).join(",")}}`;
    }
    active.delete(input); return result;
  }
  return encode(value);
}
export function sha256(bytes: string | Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
export function contentHash(value: object): string {
  canonicalJson(value); // Validate the original too; do not silently drop non-JSON fields.
  const content = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "content_hash"));
  return sha256(canonicalJson(content));
}
export function withContentHash<T extends object>(value: T): T & { content_hash: string } { return { ...value, content_hash: contentHash(value) }; }
export function verifyContentHash(value: { content_hash: string }): void {
  hashSchema.parse(value.content_hash);
  if (!timingSafeEqual(Buffer.from(value.content_hash, "hex"), Buffer.from(contentHash(value), "hex"))) throw new Error("Content hash mismatch");
}
export function verifyFile(bytes: Uint8Array, file: { sha256: string; size_bytes: number }): void {
  hashSchema.parse(file.sha256);
  if (bytes.byteLength !== file.size_bytes || !timingSafeEqual(Buffer.from(file.sha256, "hex"), Buffer.from(sha256(bytes), "hex"))) throw new Error("File checksum or size mismatch");
}
