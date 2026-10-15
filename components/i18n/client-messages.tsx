import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import { MessagesProvider } from "@/lib/i18n/context";
import { pickMessages, type MessagePath } from "@/lib/i18n/messages";

/**
 * Sends the client components below it the message groups they read, in one
 * language (launch L-24b). Render it from a server component, next to the
 * client component that needs the messages; it reads the catalogues, so a
 * client component must never import it.
 */
export function ClientMessages({
  locale,
  groups,
  children,
}: {
  locale: Locale;
  groups: readonly MessagePath[];
  children: ReactNode;
}) {
  return <MessagesProvider messages={pickMessages(locale, groups)}>{children}</MessagesProvider>;
}
