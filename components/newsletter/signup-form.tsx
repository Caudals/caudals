"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";

/**
 * Subscribe box for the archive pages.
 *
 * Posts to the same `/api/waitlist` route the hero uses, so there is one server
 * path that records interest and starts the double opt-in — with `source`
 * telling the two apart in the CRM.
 */

interface Props {
  source: string;
  compact?: boolean;
}

export function NewsletterSignupForm({ source, compact = false }: Props) {
  const t = useTranslations();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) return;

    setState("sending");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, website }),
      });

      setState(response.ok ? "done" : "error");
      if (response.ok) setEmail("");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="text-base font-medium text-teal-700">
        {t("Almost there — click the link in your inbox to confirm.")}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {!compact && (
        <div>
          <p className="text-lg font-semibold text-slate-900">
            {t("Get it every other Tuesday")}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {t("No spam, no link roundups. One click to unsubscribe, always.")}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("you@company.com")}
          className="h-11 flex-1 rounded-lg"
          aria-label={t("Email")}
        />
        {/* Bot trap: hidden from people, irresistible to scripts. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        <Button type="submit" disabled={state === "sending"} className="h-11 rounded-lg px-6">
          {state === "sending" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t("Subscribe")}
        </Button>
      </div>

      {state === "error" && (
        <p className="text-sm text-red-600">
          {t("We couldn't save your request. Please try again.")}
        </p>
      )}
    </form>
  );
}
