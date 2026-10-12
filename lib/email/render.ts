import type { ReactNode } from "react";

/**
 * Renders email JSX to static HTML without react-dom/server.
 *
 * The evaluation workers (and the scheduler that sends notification and
 * lifecycle email) run under Node's `react-server` export condition, which
 * `server-only` modules need. Under that condition `react-dom/server` is a
 * stub that throws, so `@react-email/render` cannot run there. Email templates
 * are plain function components (no hooks, context or effects), so a small
 * serialiser covers them exactly; `tests/email/templates.test.ts` checks its
 * output against react-dom/server for every template.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
// CSS properties that take plain numbers (React's list, the ones emails use).
const UNITLESS = new Set(["fontWeight", "lineHeight", "opacity", "zIndex", "flex", "flexGrow", "flexShrink", "order", "orphans", "widows"]);
// React's renames; other props keep their spelling (HTML attributes ignore case).
const ATTRIBUTE_NAMES: Record<string, string> = { className: "class", htmlFor: "for", httpEquiv: "http-equiv", charSet: "charset" };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[char]!);
}

function styleString(style: Record<string, unknown>) {
  return Object.entries(style)
    .filter(([, value]) => value !== null && value !== undefined && value !== "" && typeof value !== "boolean")
    .map(([name, value]) => {
      const property = name.startsWith("--") ? name : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
      const text = typeof value === "number" && value !== 0 && !UNITLESS.has(name) ? `${value}px` : String(value);
      return `${property}:${text.trim()}`;
    })
    .join(";");
}

function attributes(props: Record<string, unknown>) {
  let out = "";
  for (const [name, value] of Object.entries(props)) {
    if (name === "children" || name === "key" || name === "ref" || value === null || value === undefined || value === false) continue;
    if (typeof value === "function" || name === "dangerouslySetInnerHTML") throw new Error("email_template_unsupported_prop");
    const attribute = ATTRIBUTE_NAMES[name] ?? name;
    if (name === "style") {
      const css = styleString(value as Record<string, unknown>);
      if (css) out += ` style="${escapeHtml(css)}"`;
      continue;
    }
    if (name === "href" && typeof value === "string" && !/^(https?:|mailto:)/i.test(value)) throw new Error("email_template_unsafe_link");
    out += value === true ? ` ${attribute}=""` : ` ${attribute}="${escapeHtml(String(value))}"`;
  }
  return out;
}

type Element = { $$typeof: symbol; type: unknown; props: Record<string, unknown> };
const FRAGMENT = Symbol.for("react.fragment");

function isElement(node: unknown): node is Element {
  return typeof node === "object" && node !== null && "$$typeof" in node && "type" in node && "props" in node;
}

/** Static markup for a tree of intrinsic elements and plain function components. */
export function renderToStaticHtml(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return escapeHtml(node);
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map((child) => renderToStaticHtml(child as ReactNode)).join("");
  if (!isElement(node)) throw new Error("email_template_unsupported_node");
  const { type, props } = node;
  if (type === FRAGMENT) return renderToStaticHtml(props.children as ReactNode);
  if (typeof type === "function") return renderToStaticHtml((type as (props: unknown) => ReactNode)(props));
  if (typeof type !== "string") throw new Error("email_template_unsupported_type");
  if (VOID.has(type)) return `<${type}${attributes(props)}/>`;
  return `<${type}${attributes(props)}>${renderToStaticHtml(props.children as ReactNode)}</${type}>`;
}

const DOCTYPE = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

/** A full email document, as @react-email/render produces it. */
export function renderEmailDocument(node: ReactNode) {
  return DOCTYPE + renderToStaticHtml(node);
}
