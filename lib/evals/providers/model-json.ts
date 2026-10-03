/**
 * JSON from a model reply (docs/evals/grading-engine.md, "Model output").
 *
 * Even in JSON mode models wrap the object in fences or prose, put raw
 * control characters inside strings, leave trailing commas, or lose one
 * bracket in a long object (seen on 2026-10-03 with a free OpenRouter model:
 * `"materialRisks":[…],"confidence":…}` without the opening `{"values":`,
 * which closes the whole object early). The repairs here are structural
 * only: they never invent content, and every caller still validates the
 * shape it needs, so a repaired reply is held to the same contract.
 */

/** Strip a code fence and anything before the first bracket. */
function unwrap(text: string): string {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const start = trimmed.search(/[[{]/);
  return start > 0 ? trimmed.slice(start) : trimmed;
}

const CONTROL_ESCAPES: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };

/**
 * One pass over the text with a bracket stack:
 * - raw control characters inside strings become escapes,
 * - a closer that matches nothing open, or the wrong opener, is dropped,
 * - a closer that would end the top-level value while more members follow
 *   is dropped (the model closed too early),
 * - trailing commas before a closer are removed,
 * - prose after the top-level value is ignored.
 * Unbalanced (truncated) text is returned as is and stays invalid.
 */
export function repairJson(text: string): string {
  const source = unwrap(text);
  const start = source.search(/[[{]/);
  if (start < 0) return source;
  let out = "";
  const stack: string[] = [];
  let inString = false, escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (escaped) { escaped = false; out += char; continue; }
      if (char === "\\") { escaped = true; out += char; continue; }
      if (char === '"') { inString = false; out += char; continue; }
      out += char < " " ? CONTROL_ESCAPES[char] ?? " " : char;
      continue;
    }
    if (char === '"') { inString = true; out += char; continue; }
    if (char === "{" || char === "[") { stack.push(char === "{" ? "}" : "]"); out += char; continue; }
    if (char === "}" || char === "]") {
      if (stack.at(-1) !== char) continue;
      if (stack.length === 1 && /^\s*,\s*"/.test(source.slice(index + 1, index + 64))) continue;
      stack.pop();
      out = out.replace(/,\s*$/, "") + char;
      if (!stack.length) return out;
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * Parse a model's JSON reply: the text as given, then each caller-specific
 * repair (with and without the structural one), then the structural repair.
 * Throws "model_output_not_json" when nothing parses.
 */
export function parseModelJsonText(text: string, repairs: Array<(text: string) => string> = []): unknown {
  const base = unwrap(text);
  try { return JSON.parse(base); } catch { /* repair below */ }
  // Caller-specific repairs know the contract, so they go before the generic one.
  for (const candidate of [...repairs.map((repair) => repair(base)), base]) {
    try { return JSON.parse(candidate); } catch { /* try the structural repair */ }
    try { return JSON.parse(repairJson(candidate)); } catch { /* next candidate */ }
  }
  // Prose with a bracket before the object ("Verdict [final]: {…}").
  const object = base.indexOf("{");
  if (object > 0) return parseModelJsonText(base.slice(object), repairs);
  throw new Error("model_output_not_json");
}

/** End index (exclusive) of the bracketed value starting at `start`, string-aware; -1 if unbalanced. */
function valueEnd(text: string, start: number): number {
  let depth = 0, inString = false, escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if ((char === "}" || char === "]") && --depth === 0) return index + 1;
  }
  return -1;
}

/**
 * Re-wrap list fields written as a bare array where the contract wants
 * `{"values":[…],"confidence":…,"citations":[…]}`: `"field":[…],"confidence"`
 * gets its missing `{"values":` back, and the brace that then looked
 * premature closes it again.
 */
export function restoreValuesWrapper(fields: readonly string[]) {
  return (text: string): string => {
    let out = text;
    for (const field of fields) {
      const pattern = new RegExp(`"${field}"\\s*:\\s*\\[`, "g");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(out))) {
        const open = match.index + match[0].length - 1;
        const end = valueEnd(out, open);
        if (end < 0) break;
        if (!/^\s*,\s*"(confidence|citations)"/.test(out.slice(end, end + 40))) continue;
        out = `${out.slice(0, open)}{"values":${out.slice(open)}`;
        pattern.lastIndex = end + 11;
      }
    }
    return out;
  };
}
