import Link from "next/link";
import type { NewsletterBlock } from "@/lib/newsletter/client";

/**
 * The web rendering of a newsletter block.
 *
 * The email renderer in growth-social draws these as a 600px table because
 * Outlook demands it; here a browser is reading, so the same content gets a
 * normal responsive document. One set of blocks, two presentations, no second
 * copy of the content.
 */

function isSafeUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** The same small markdown subset the email renderer supports. */
function inlineMarkdown(source: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));

    if (match[1] && isSafeUrl(match[2])) {
      nodes.push(
        <a
          key={key++}
          href={match[2]}
          className="text-blue-700 underline underline-offset-2 hover:text-blue-800"
          rel="noopener noreferrer"
        >
          {match[1]}
        </a>
      );
    } else if (match[3]) {
      nodes.push(<strong key={key++}>{match[3]}</strong>);
    } else if (match[4]) {
      nodes.push(
        <code key={key++} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em]">
          {match[4]}
        </code>
      );
    } else if (match[5]) {
      nodes.push(<em key={key++}>{match[5]}</em>);
    } else {
      nodes.push(match[0]);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

export function NewsletterBlockView({ block }: { block: NewsletterBlock }) {
  const content = block.content ?? {};
  const str = (key: string) => String(content[key] ?? "");

  switch (block.kind) {
    case "heading": {
      const level = Number(content["level"] ?? 2);
      const Tag = level <= 2 ? "h2" : "h3";
      return (
        <Tag
          className={
            level <= 2
              ? "mt-10 mb-3 text-2xl font-bold tracking-tight text-slate-900"
              : "mt-8 mb-2 text-xl font-semibold text-slate-900"
          }
        >
          {str("text")}
        </Tag>
      );
    }

    case "text":
      return (
        <>
          {str("markdown")
            .trim()
            .split(/\n{2,}/)
            .map((paragraph, index) => (
              <p key={index} className="mb-5 text-[1.0625rem] leading-[1.72] text-slate-700">
                {inlineMarkdown(paragraph)}
              </p>
            ))}
        </>
      );

    case "image":
      return isSafeUrl(content["url"]) ? (
        <figure className="my-8">
          {/* Remote host is the Postiz media library; next/image would need it
              whitelisted per deployment, and a plain img is correct here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={String(content["url"])}
            alt={str("alt")}
            className="w-full rounded-xl border border-slate-200"
            loading="lazy"
          />
          {str("caption") && (
            <figcaption className="mt-2 text-sm text-slate-500">{str("caption")}</figcaption>
          )}
        </figure>
      ) : null;

    case "tool_card":
      return (
        <div className="my-5 rounded-xl border border-slate-200 p-5">
          <p className="mb-1 text-lg font-bold text-slate-900">
            {isSafeUrl(content["url"]) ? (
              <a
                href={String(content["url"])}
                className="hover:text-blue-700"
                rel="noopener noreferrer"
              >
                {str("name")} →
              </a>
            ) : (
              str("name")
            )}
          </p>
          <p className="mb-2 text-[1rem] leading-relaxed text-slate-700">{str("what_for")}</p>
          {str("verdict") && (
            <p className="mb-2 text-sm leading-relaxed text-slate-500">{str("verdict")}</p>
          )}
          {str("price") && <p className="text-sm text-slate-500">{str("price")}</p>}
        </div>
      );

    case "link_list": {
      const items = Array.isArray(content["items"])
        ? (content["items"] as Array<Record<string, unknown>>)
        : [];
      return (
        <ul className="my-5 list-disc space-y-2 pl-5 text-[1rem] leading-relaxed text-slate-700">
          {items
            .filter((item) => isSafeUrl(item["url"]))
            .map((item, index) => (
              <li key={index}>
                <a
                  href={String(item["url"])}
                  className="font-semibold text-blue-700 hover:text-blue-800"
                  rel="noopener noreferrer"
                >
                  {String(item["title"] ?? "")}
                </a>
                {item["note"] ? (
                  <span className="text-slate-500"> — {String(item["note"])}</span>
                ) : null}
              </li>
            ))}
        </ul>
      );
    }

    case "quote":
      return (
        <blockquote className="my-7 border-l-[3px] border-blue-600 pl-5">
          <p className="text-lg italic leading-relaxed text-slate-800">{str("text")}</p>
          {str("attribution") && (
            <cite className="mt-2 block text-sm not-italic text-slate-500">
              — {str("attribution")}
            </cite>
          )}
        </blockquote>
      );

    case "video":
      return isSafeUrl(content["url"]) ? (
        <p className="my-6">
          <a
            href={String(content["url"])}
            className="font-semibold text-blue-700 hover:text-blue-800"
            rel="noopener noreferrer"
          >
            ▶ {str("title") || "Ver el vídeo"}
          </a>
        </p>
      ) : null;

    case "code":
      return (
        <pre className="my-6 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm leading-relaxed text-slate-100">
          <code>{str("source")}</code>
        </pre>
      );

    case "divider":
      return <hr className="my-9 border-slate-200" />;

    case "cta":
      return isSafeUrl(content["url"]) ? (
        <div className="my-9 text-center">
          <Link
            href={String(content["url"])}
            className="inline-block rounded-lg bg-slate-900 px-7 py-3.5 font-semibold text-white transition hover:bg-slate-800"
          >
            {str("label")}
          </Link>
          {str("note") && <p className="mt-3 text-sm text-slate-500">{str("note")}</p>}
        </div>
      ) : null;

    default:
      return null;
  }
}
