// Text helpers shared by the v2 grader and the web capture. They compare
// meaning-bearing characters only: case, accents, punctuation, whitespace and
// number formatting never decide whether two texts say the same thing.

const STOPWORDS = new Set([
  // English
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "be", "can", "you", "your", "it", "this", "that",
  "at", "by", "from", "as", "do", "does", "how", "what", "which", "who", "when", "where", "will", "my", "i", "we", "our", "there",
  // Spanish
  "el", "la", "los", "las", "un", "una", "unos", "unas", "y", "o", "de", "del", "al", "a", "en", "con", "por", "para", "que", "es",
  "son", "se", "su", "sus", "lo", "le", "les", "mi", "tu", "como", "cómo", "cual", "cuál", "cuales", "cuáles", "qué", "quien",
  "puede", "pueden", "hay", "si", "no", "me", "te", "nos", "este", "esta", "esto", "ese", "esa",
]);

/** Lower case, no accents, no punctuation, single spaces. Numbers keep their digits. */
export function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    // 1.000,50 / 1,000.50 / 1 000 → 1000.50 / 1000.50 / 1000
    .replace(/(\d)[.,\s  ](?=\d{3}\b)/g, "$1")
    .replace(/(\d),(\d{1,2})\b/g, "$1.$2")
    .replace(/[^\p{L}\p{N}.%€$£]+/gu, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentWords(value: string): string[] {
  return foldText(value).split(" ").filter((word) => word && (/\d/.test(word) || (word.length >= 3 && !STOPWORDS.has(word))));
}

/** Share of a fact's content words that occur in the answer (1 when the folded fact is a substring). */
export function factCoverage(fact: string, answer: string): number {
  const folded = foldText(fact), haystack = ` ${foldText(answer)} `;
  if (!folded) return 0;
  if (haystack.includes(` ${folded} `) || haystack.includes(folded)) return 1;
  const words = [...new Set(contentWords(fact))];
  if (!words.length) return 0;
  const present = new Set(contentWords(answer));
  // Numbers must match exactly; a different amount is never the same fact.
  const numbers = words.filter((word) => /\d/.test(word));
  if (numbers.some((word) => !present.has(word))) return 0;
  return words.filter((word) => present.has(word)).length / words.length;
}

export const LEXICAL_FACT_THRESHOLD = 0.75;

/**
 * A captured reply that is only the user's own message (often with a
 * timestamp or "you" label appended) is the widget's echo, not an answer.
 */
export function isEchoOfPrompt(reply: string, prompt: string): boolean {
  const a = foldText(reply), b = foldText(prompt);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!a.includes(b) || a.length - b.length > 24) return false;
  // Only sender labels, read receipts and timestamps may surround the echo.
  const rest = a.replace(b, " ").replace(/\b(tu|you|yo|me|usuario|user|cliente|customer|visitor|visitante|invitado|guest|enviado|sent|leido|read|visto|seen|ahora|now|am|pm|hoy|today)\b|\b\d{1,2}( \d{2}){1,2}\b/g, " ").trim();
  return rest === "";
}

const ES = /\b(el|la|los|las|de|del|que|para|con|por|una|qué|cómo|cuál|puedo|puede|hay|mi|tu|es|son|en)\b/giu;
const EN = /\b(the|of|to|and|is|are|for|with|what|how|which|can|my|your|do|does|in|on)\b/giu;
/** "es", "en" or null, from function words. Good enough for one question. */
export function guessLanguage(...texts: string[]): "es" | "en" | null {
  const text = texts.join(" ");
  const es = (text.match(ES) ?? []).length + (/[ñ¿¡áéíóú]/i.test(text) ? 2 : 0);
  const en = (text.match(EN) ?? []).length;
  if (es === 0 && en === 0) return null;
  if (es >= en * 1.3) return "es";
  if (en >= es * 1.3) return "en";
  return null;
}

export function languageName(tag: string | null | undefined): string {
  const primary = (tag ?? "").split("-")[0].toLowerCase();
  if (primary === "es") return "Spanish (Spain)";
  if (primary === "en" || !primary) return "English";
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(primary) ?? "English"; } catch { return "English"; }
}

/**
 * A short reply that only reports a temporary failure of the assistant ("Ha
 * ocurrido un error, inténtalo más tarde"): worth asking again in a fresh
 * browser before it is recorded as the system's answer.
 */
export function transientErrorReply(text: string) {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value || value.length > 220) return false;
  return /(ha ocurrido|se ha producido|hubo|ocurri[oó]) (un|algún) error|algo (ha ido|sali[oó]) mal|int[eé]nta(lo|r)( de nuevo)? m[aá]s tarde|vuelve a intentarlo|no (he podido|puedo) (procesar|responder) (tu|su) (consulta|mensaje|solicitud) en este momento|servicio no (est[aá] )?disponible|error interno|demasiadas (solicitudes|peticiones)|something went wrong|an (unexpected )?error (has )?occurred|(please )?try again later|service (is )?(temporarily )?unavailable|internal (server )?error|too many requests|network error|error de (red|conexi[oó]n)/i.test(value);
}
