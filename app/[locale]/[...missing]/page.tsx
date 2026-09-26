import { notFound } from "next/navigation";

/**
 * Any path under a locale that matches no page. Calling `notFound()` here,
 * rather than letting the router miss, renders `app/[locale]/not-found.tsx`
 * inside the locale's own layout: the 404 is in the reader's language and its
 * `<html lang>` is right.
 */
export default function MissingPage() {
  notFound();
}
