import { splitLocale, toInternalPathname } from "@/lib/i18n/routing";

/**
 * The funnel event a click on a public link stands for, from its locale-
 * prefixed path: the booking page is a readout request, the contact form a
 * pilot request. Spanish paths are translated (`/es/llamada`, `/es/contacto`),
 * so they are resolved to the internal page first.
 */
export function funnelLinkEvent(pathname: string): "readout_link_clicked" | "pilot_requested" | null {
  const { locale, pathname: rest } = splitLocale(pathname);
  if (!locale) return null;
  const page = toInternalPathname(rest, locale);
  return page === "/call" ? "readout_link_clicked" : page === "/contact" ? "pilot_requested" : null;
}
