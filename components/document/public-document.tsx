import type { ReactNode } from "react";
import "@/app/globals.css";
import { SiteAnalytics } from "@/components/legal/site-analytics";

/**
 * The `<html>` and `<body>` of the public site (`app/[locale]/layout.tsx`).
 *
 * Nothing public depends on who is signed in, so it carries neither the auth
 * client nor the toast host. It is a separate module from `RootDocument`
 * because a layout loads the script of every client component its server
 * modules import, rendered or not: importing `RootDocument` put the session
 * client, Better Auth and Sonner (~40 KB compressed) on every public page
 * (launch L-24b). The contact form mounts its own toast host.
 *
 * `lang` comes from the URL segment, so the served HTML declares the right
 * language before any script runs. It reads nothing from the request, so the
 * public pages stay statically rendered.
 */
export function PublicDocument({ lang, children }: { lang: string; children: ReactNode }) {
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
