/**
 * Splits "text *highlighted* text" into its plain and highlighted parts.
 *
 * Headlines mark their serif-italic word this way in the message and content
 * files. Pure, so server code (the share images) can use it as well as the
 * client components.
 */
export function splitMarked(sentence: string) {
  const match = /^(.*?)\*(.+?)\*(.*)$/.exec(sentence);
  return match
    ? { before: match[1], marked: match[2], after: match[3] }
    : { before: sentence, marked: "", after: "" };
}
