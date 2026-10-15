import type { ReactNode } from "react";
import "@/app/globals.css";
import { Toaster } from "sonner";
import { SessionKeepAlive } from "@/lib/auth/session-keep-alive";
import { SiteAnalytics } from "@/components/legal/site-analytics";

export { rootMetadata } from "./root-metadata";

/**
 * The `<html>` and `<body>` of the internal surfaces' root layouts (`(app)`,
 * `(auth)`, `(evaluation)`): toasts and the session renewal around the page
 * (`SessionKeepAlive`; it replaced an unread `useSession` provider that asked
 * for the session on every load, R1).
 * The public site uses `PublicDocument`, which loads neither (launch L-24b).
 *
 * `lang` is fixed per layout, so the served HTML declares the right language
 * before any script runs — which is what crawlers that do not execute
 * JavaScript read.
 *
 * It deliberately reads nothing from the request: doing so would opt every
 * route below it out of static rendering.
 */
export function RootDocument({
  lang,
  head,
  children,
}: {
  lang: string;
  /** Extra head content for a surface (for example the app's locale boot script). */
  head?: ReactNode;
  children: ReactNode;
}) {
  return (
    <html lang={lang} suppressHydrationWarning>
      {/* App-router root layouts may render <head>; this is not the pages-router rule. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      {head ? <head>{head}</head> : null}
      <body className="font-sans antialiased">
        {children}
        <Toaster richColors position="top-right" closeButton={false} />
        <SessionKeepAlive />
        <SiteAnalytics />
      </body>
    </html>
  );
}
