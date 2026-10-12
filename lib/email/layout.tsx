import type { ReactNode } from "react";
import type { EmailLocale } from "./copy";

/**
 * The branded email frame (launch L-07): the public site's Paper language
 * (docs/DESIGN.md §13) in table markup that email clients render: warm canvas,
 * one white sheet with a hairline, ink type, a near-black pill for the single
 * main action, sentence case, no colour accent and no images. Every template
 * is data (`EmailContent`) laid out here, so HTML and plain text never drift.
 */

export type EmailBlock =
  | { kind: "text"; text: string; tone?: "body" | "lead" | "muted" }
  | { kind: "action"; label: string; url: string; showUrl?: boolean }
  | { kind: "link"; label: string; url: string }
  | { kind: "steps"; items: string[] }
  | { kind: "facts"; rows: Array<[string, string]> };

export type EmailCategory = "essential" | "notification" | "billing" | "lifecycle";

export type EmailContent = {
  locale: EmailLocale;
  category: EmailCategory;
  subject: string;
  preview: string;
  heading: string;
  blocks: EmailBlock[];
  /** Plain sentences under the sheet: why this email was sent. */
  footer: string[];
  /** Link under the sheet: email settings or unsubscribe. */
  footerLink?: { label: string; url: string };
  signoff: string;
  address: string;
  copyLink: string;
};

const CANVAS = "#fafaf8";
const SHEET = "#ffffff";
const INK = "#141413";
const INK_2 = "#3b3a36";
const MUTED = "#6b6a63";
const LINE = "#dcdad3";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function Block({ block, copyLink }: { block: EmailBlock; copyLink: string }) {
  switch (block.kind) {
    case "text":
      return (
        <p
          style={{
            margin: "0 0 16px",
            fontSize: block.tone === "muted" ? 14 : 16,
            lineHeight: 1.55,
            color: block.tone === "muted" ? MUTED : block.tone === "lead" ? INK : INK_2,
            fontWeight: block.tone === "lead" ? 500 : 400,
          }}
        >
          {block.text}
        </p>
      );
    case "action":
      return (
        <>
          <table cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: "8px 0 20px" }}>
            <tbody>
              <tr>
                <td style={{ backgroundColor: INK, borderRadius: 999 }}>
                  <a
                    href={block.url}
                    style={{
                      display: "inline-block",
                      padding: "12px 22px",
                      color: SHEET,
                      textDecoration: "none",
                      fontSize: 15,
                      fontWeight: 500,
                      borderRadius: 999,
                    }}
                  >
                    {block.label}
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
          {block.showUrl && (
            <p style={{ margin: "0 0 20px", fontSize: 13, lineHeight: 1.5, color: MUTED, wordBreak: "break-all" }}>
              {copyLink}
              <br />
              <a href={block.url} style={{ color: MUTED }}>
                {block.url}
              </a>
            </p>
          )}
        </>
      );
    case "link":
      return (
        <p style={{ margin: "0 0 16px", fontSize: 15, lineHeight: 1.55 }}>
          <a href={block.url} style={{ color: INK, textDecoration: "underline" }}>
            {block.label}
          </a>
        </p>
      );
    case "steps":
      return (
        <table width="100%" cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: "0 0 20px" }}>
          <tbody>
            {block.items.map((item, index) => (
              <tr key={index}>
                <td style={{ width: 28, padding: "10px 0", borderTop: `1px solid ${LINE}`, fontSize: 14, color: MUTED, verticalAlign: "top" }}>
                  {index + 1}
                </td>
                <td style={{ padding: "10px 0", borderTop: `1px solid ${LINE}`, fontSize: 15, lineHeight: 1.5, color: INK_2 }}>{item}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "facts":
      return (
        <table width="100%" cellPadding="0" cellSpacing="0" role="presentation" style={{ margin: "0 0 20px" }}>
          <tbody>
            {block.rows.map(([label, value], index) => (
              <tr key={index}>
                <td style={{ padding: "9px 12px 9px 0", borderTop: `1px solid ${LINE}`, fontSize: 14, color: MUTED }}>{label}</td>
                <td style={{ padding: "9px 0", borderTop: `1px solid ${LINE}`, fontSize: 14, color: INK, textAlign: "right" }}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
}

export function EmailLayout({ content }: { content: EmailContent }): ReactNode {
  // A standalone email document, never a Next.js page: next/head does not apply.
  return (
    <html lang={content.locale} dir="ltr">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light" />
        <title>{content.subject}</title>
      </head>
      <body style={{ margin: 0, padding: 0, backgroundColor: CANVAS }}>
        <div style={{ display: "none", overflow: "hidden", maxHeight: 0, opacity: 0, fontSize: 1, lineHeight: 1, color: CANVAS }}>{content.preview}</div>
        <table width="100%" cellPadding="0" cellSpacing="0" role="presentation" style={{ backgroundColor: CANVAS, fontFamily: FONT, color: INK }}>
          <tbody>
            <tr>
              <td style={{ padding: "32px 12px" }}>
                <table
                  width="100%"
                  cellPadding="0"
                  cellSpacing="0"
                  role="presentation"
                  style={{ maxWidth: 560, margin: "0 auto", backgroundColor: SHEET, borderRadius: 14, border: `1px solid ${LINE}` }}
                >
                  <tbody>
                    <tr>
                      <td style={{ padding: "32px 32px 28px" }}>
                        <p style={{ margin: "0 0 28px", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", color: INK }}>Caudals</p>
                        <h1 style={{ margin: "0 0 16px", fontSize: 22, lineHeight: 1.3, fontWeight: 600, letterSpacing: "-0.02em", color: INK }}>
                          {content.heading}
                        </h1>
                        {content.blocks.map((block, index) => (
                          <Block key={index} block={block} copyLink={content.copyLink} />
                        ))}
                        <p style={{ margin: "8px 0 0", fontSize: 15, color: INK }}>{content.signoff}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <table width="100%" cellPadding="0" cellSpacing="0" role="presentation" style={{ maxWidth: 560, margin: "0 auto" }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: "16px 8px 0", fontSize: 12, lineHeight: 1.5, color: MUTED, textAlign: "center" }}>
                        {content.footer.map((line, index) => (
                          <p key={index} style={{ margin: "0 0 6px" }}>
                            {line}
                          </p>
                        ))}
                        {content.footerLink && (
                          <p style={{ margin: "0 0 6px" }}>
                            <a href={content.footerLink.url} style={{ color: MUTED, textDecoration: "underline" }}>
                              {content.footerLink.label}
                            </a>
                          </p>
                        )}
                        <p style={{ margin: 0 }}>{content.address}</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

/** The plain-text alternative, built from the same content. */
export function renderEmailText(content: EmailContent) {
  const parts: string[] = [content.heading];
  for (const block of content.blocks) {
    if (block.kind === "text") parts.push(block.text);
    else if (block.kind === "action" || block.kind === "link") parts.push(`${block.label}:\n${block.url}`);
    else if (block.kind === "steps") parts.push(block.items.map((item, index) => `${index + 1}. ${item}`).join("\n"));
    else parts.push(block.rows.map(([label, value]) => `${label}: ${value}`).join("\n"));
  }
  parts.push(content.signoff, "--");
  const footer = [...content.footer];
  if (content.footerLink) footer.push(`${content.footerLink.label}: ${content.footerLink.url}`);
  footer.push(content.address);
  return `${parts.join("\n\n")}\n${footer.join("\n")}\n`;
}
