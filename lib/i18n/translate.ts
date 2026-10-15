/**
 * Message lookup without the catalogues.
 *
 * Everything here works on a dictionary passed in, so client components can
 * import it without bundling `en.json` and `es.json`: the public site sends
 * each page only the namespaces its client components read, in one language
 * (`lib/i18n/context.tsx`, launch L-24b). The catalogues themselves are loaded
 * by `lib/i18n/messages.ts`, on the server.
 *
 * `en.json` is the single source of truth for the shape of the dictionary: its
 * nested structure generates `MessageKey`, a union of every valid dotted path
 * (`"hero.headline"`, `"contact.submit"`, …).
 *
 * Interpolation uses single braces — `"© {year} Caudals."` — and missing values
 * are left as-is rather than blanked, which makes an unfilled slot visible in
 * review instead of shipping an empty string.
 */

import type en from "./messages/en.json";

/** The canonical dictionary shape, derived from the English messages. */
export type Messages = typeof en;

/** A top-level namespace of the dictionary (`"nav"`, `"demo"`, …). */
export type Namespace = keyof Messages & string;

/** Recursively builds the union of dotted paths that resolve to a string. */
type DottedKeys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DottedKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = DottedKeys<Messages>;

/** Recursively builds the union of dotted paths that resolve to a group of messages. */
type DottedGroups<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : `${Prefix}${K}` | DottedGroups<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** A namespace or a nested group of messages (`"demo"`, `"steps.exam"`). */
export type MessageGroup = DottedGroups<Messages>;

/** A group of messages or a single message, as `pickMessages` takes them. */
export type MessagePath = MessageGroup | MessageKey;

export type TranslationValues = Record<string, string | number>;

/** A dictionary holding some namespaces, or some groups inside them. */
export type PartialMessages = { [N in Namespace]?: unknown };

const INTERPOLATION = /\{(\w+)\}/g;

export function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(INTERPOLATION, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

export function resolveMessage(messages: unknown, key: string): string | undefined {
  let current: unknown = messages;
  for (const segment of key.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

/** The group of messages at a dotted path, or undefined when there is none. */
export function resolveGroup(messages: unknown, segments: readonly string[]): unknown {
  let current: unknown = messages;
  for (const segment of segments) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export type Translator = (key: MessageKey, values?: TranslationValues) => string;

/**
 * Builds a translator over a dictionary. A key missing from `messages` falls
 * back to `fallback` when one is given, and a key missing everywhere returns
 * the key itself, so the gap is obvious on screen rather than rendering blank.
 * `onMissing` is told about each such key (the client uses it to name a
 * namespace a page forgot to send).
 */
export function translatorFrom(
  messages: unknown,
  fallback?: unknown,
  onMissing?: (key: string) => void,
): Translator {
  return (key, values) => {
    const template =
      resolveMessage(messages, key) ??
      (fallback === undefined ? undefined : resolveMessage(fallback, key));
    if (template === undefined) {
      onMissing?.(key);
      return key;
    }
    return interpolate(template, values);
  };
}

/**
 * Narrows a translator to one namespace, so a component reads
 * `t("headline")` instead of repeating `"hero."` at every call site.
 */
export type NamespaceKeys<N extends string> = MessageKey extends infer K
  ? K extends `${N}.${infer Rest}`
    ? Rest
    : never
  : never;

export type ScopedTranslator<N extends string> = (
  key: NamespaceKeys<N>,
  values?: TranslationValues,
) => string;

export function scopeTranslator<N extends string>(
  translate: Translator,
  namespace: N,
): ScopedTranslator<N> {
  return (key, values) =>
    translate(`${namespace}.${key}` as MessageKey, values);
}

/** Deep-merges message groups, so two providers that each send part of one namespace add up. */
export function mergeMessages(base: PartialMessages, extra: PartialMessages): PartialMessages {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = merged[key];
    merged[key] =
      isGroup(current) && isGroup(value)
        ? mergeMessages(current as PartialMessages, value as PartialMessages)
        : value;
  }
  return merged as PartialMessages;
}

function isGroup(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
