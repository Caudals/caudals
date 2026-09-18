import { z } from "zod";
import { selectorSchema } from "../contracts/primitives";

export type JsonSelector = z.infer<typeof selectorSchema>;

export function selectJson(value: unknown, selector: string): unknown {
  selectorSchema.parse(selector);
  if (selector === "$") return value;
  const tokens = selector.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_]*|\[(?:0|[1-9]\d*)\]/g) ?? [];
  let current = value;
  for (const token of tokens) {
    if (token.startsWith(".")) {
      if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[token.slice(1)];
    } else {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(token.slice(1, -1))];
    }
  }
  return current;
}

export function assignJson(target: Record<string, unknown>, selector: string, value: unknown): void {
  selectorSchema.parse(selector);
  if (selector === "$") throw new Error("root_assignment_denied");
  const tokens = selector.slice(1).match(/\.[A-Za-z_][A-Za-z0-9_]*|\[(?:0|[1-9]\d*)\]/g) ?? [];
  let current: Record<string, unknown> | unknown[] = target;
  tokens.forEach((token, index) => {
    const last = index === tokens.length - 1;
    const nextArray = !last && tokens[index + 1].startsWith("[");
    if (token.startsWith(".")) {
      if (Array.isArray(current)) throw new Error("mapping_shape_invalid");
      const key = token.slice(1);
      if (last) current[key] = value;
      else current = (current[key] ??= nextArray ? [] : {}) as Record<string, unknown> | unknown[];
    } else {
      if (!Array.isArray(current)) throw new Error("mapping_shape_invalid");
      const key = Number(token.slice(1, -1));
      if (key > 1000) throw new Error("mapping_index_too_large");
      if (last) current[key] = value;
      else current = (current[key] ??= nextArray ? [] : {}) as Record<string, unknown> | unknown[];
    }
  });
}
