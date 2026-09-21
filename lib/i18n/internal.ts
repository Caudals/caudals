/**
 * Pass-through translator for the internal surfaces.
 *
 * The Operator Console (`/admin`), the auth routes and the app shell are
 * English-only by design: AGENTS.md requires strict separation between public
 * marketing pages and these internal surfaces, and they sit outside the
 * `/[locale]` tree, so no locale is ever resolved for them.
 *
 * They previously called the public translator, which meant a Spanish visitor
 * could see a half-translated console and every operator string had to live in
 * the public dictionary. This returns the source string unchanged, with the
 * same interpolation syntax, so those call sites keep reading naturally while
 * staying out of the public message files.
 */

export type InternalTranslationValues = Record<string, string | number>;

export type InternalTranslator = (
  message: string,
  values?: InternalTranslationValues,
) => string;

const INTERPOLATION = /\{(\w+)\}/g;

export const translateInternal: InternalTranslator = (message, values) => {
  if (!values) return message;
  return message.replace(INTERPOLATION, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
};

/** Hook form, so client components keep their existing shape. */
export function useInternalTranslations(): InternalTranslator {
  return translateInternal;
}
