/**
 * A `mailto:` link that Cloudflare's email obfuscation leaves alone.
 *
 * With the zone's email obfuscation on, Cloudflare rewrites every address in
 * the served HTML to "[email protected]" and injects a parser-blocking
 * decoder (`/cdn-cgi/scripts/…/email-decode.min.js`) after it. On the public
 * pages that script sat in the footer: it held the HTML parser until the
 * stylesheets and the script itself had loaded, and it was one more request
 * before the first paint (launch L-24d). Cloudflare's documented
 * `<!--email_off-->` markers keep an address out of it; React cannot render
 * comments, so the anchor is written as HTML. Its content is constant (the
 * address and a class list from the caller), never user input.
 */
export function EmailLink({ email, className }: { email: string; className?: string }) {
  const classAttribute = className ? ` class="${className}"` : "";
  return (
    // `contents` keeps the wrapper out of layout: the anchor lays out as the parent's child, as before.
    <span
      className="contents"
      dangerouslySetInnerHTML={{
        __html: `<!--email_off--><a href="mailto:${email}"${classAttribute}>${email}</a><!--/email_off-->`,
      }}
    />
  );
}
