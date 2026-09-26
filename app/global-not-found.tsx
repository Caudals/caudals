import type { Metadata } from "next";
import Link from "next/link";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "Page not found | Caudals",
  robots: { index: false, follow: false },
};

/**
 * 404 for URLs outside every root layout. Public paths are redirected into a
 * locale by the proxy and get the localized `app/[locale]/not-found.tsx`; this
 * page only answers what is left, so it stays minimal and bilingual.
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 text-[#141413]">
          <p className="text-sm text-[#6b6a63]">404</p>
          <h1 className="text-3xl font-normal tracking-tight">This page does not exist.</h1>
          <p className="text-[#3b3a36]" lang="es">
            Esta página no existe.
          </p>
          <p className="flex gap-4 text-sm">
            <Link className="underline underline-offset-4" href="/en">
              Caudals in English
            </Link>
            <Link className="underline underline-offset-4" href="/es" lang="es">
              Caudals en español
            </Link>
          </p>
        </main>
      </body>
    </html>
  );
}
