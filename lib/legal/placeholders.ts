/**
 * Values that must never reach a published legal page, Stripe or an invoice.
 *
 * The launch spec (§3.2, decision D-01) lists realistic-format but fictitious
 * company data for development and Stripe test mode. Publishing it would make a
 * false legal notice, so the legal-content test fails if any of these values,
 * or a bracketed fill-in such as `[NIF/CIF]`, appears in `content/legal/*`, and
 * `getLegalEntity()` ignores a runtime value that contains one of them.
 */

/** The visibly fictitious identifiers: an all-zero NIF, street and registry entry. */
export const LEGAL_ENTITY_PLACEHOLDERS = [
  "B00000000",
  "Calle Ejemplo",
  "Tomo 0000",
  "VA-00000",
] as const;

/**
 * Also banned from the content files: the placeholder legal name. It may turn
 * out to be the real one, so it is not rejected at runtime, but the published
 * text must take the company name from the environment, never hard-code it.
 */
export const LEGAL_CONTENT_BANNED = [...LEGAL_ENTITY_PLACEHOLDERS, "Caudals, S.L."] as const;

/** A bracketed fill-in left in a template: `[legal company name]`, `[NIF/CIF]`. */
export const BRACKET_PLACEHOLDER = /\[[^\]\n]{0,80}\]/;

function includesAny(value: string, needles: readonly string[]) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

/** True when a runtime entity value is one of the §3.2 placeholders or a fill-in. */
export function isPlaceholderEntityValue(value: string): boolean {
  return BRACKET_PLACEHOLDER.test(value) || includesAny(value, LEGAL_ENTITY_PLACEHOLDERS);
}

/** Every placeholder found in a piece of published legal text. */
export function findLegalPlaceholders(value: string): string[] {
  const found: string[] = [];
  const bracket = value.match(BRACKET_PLACEHOLDER);
  if (bracket) found.push(bracket[0]);
  const normalized = value.toLowerCase();
  for (const banned of LEGAL_CONTENT_BANNED) {
    if (normalized.includes(banned.toLowerCase())) found.push(banned);
  }
  return found;
}
