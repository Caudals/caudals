"use client";

import { registerMessages, type Locale, type MessageKey } from "@/lib/evals/messages/runtime";

const registered = new WeakSet<object>();

/**
 * Hands the browser the messages its page reads (launch L-24c; the server
 * picks them with `evalsClientMessages`). Render it before the components that
 * read them: it registers them while it renders, so they are there when those
 * components render, on the first load and after a client-side navigation.
 * On the server the full catalogues are already registered.
 */
export function EvalsMessages({ locale, messages }: { locale: Locale; messages: Partial<Record<MessageKey, string>> }) {
  if (typeof window !== "undefined" && !registered.has(messages)) {
    registered.add(messages);
    registerMessages(locale, messages);
  }
  return null;
}
