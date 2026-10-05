import { Fragment } from "react";

/**
 * Assistants answer in light markdown. The ledger shows a one-paragraph
 * preview without markup; the detail keeps line breaks, lists and bold.
 * Nothing is rendered as HTML.
 */
const MARKUP = /(\*\*|__)(.+?)\1/g;

export function plainAnswer(text: string) {
  return text
    .replace(MARKUP, "$2")
    .replace(/^\s{0,3}(#{1,6}|>)\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "· ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function inline(line: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(MARKUP)) {
    if (match.index! > last) parts.push(line.slice(last, match.index));
    parts.push(<strong key={match.index}>{match[2]}</strong>);
    last = match.index! + match[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export function RichAnswer({ text }: { text: string }) {
  const lines = text
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .split("\n")
    .map((line) => line.replace(/^\s{0,3}(#{1,6}|>)\s*/, "").replace(/^\s*[-*•]\s+/, "· ").trimEnd())
    .filter((line, index, all) => line || (index > 0 && all[index - 1]));
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index ? <br /> : null}
          {inline(line)}
        </Fragment>
      ))}
    </>
  );
}
