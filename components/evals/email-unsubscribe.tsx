"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/evals/messages/en";
import { AuthFrame } from "./auth-frame";
import { Action, Status } from "./primitives";

const TOKEN = /^[0-9a-f]{64}$/;

/**
 * Unsubscribe from lifecycle ("getting started") email (launch L-07), linked
 * from those emails as `/workspace/unsubscribe#<token>`. The token stays in
 * the fragment, so it never reaches server logs, and nothing changes until
 * the person confirms (link scanners open pages but do not press buttons).
 * Mail clients use the RFC 8058 one-click URL in the List-Unsubscribe header.
 */
export function EmailUnsubscribe() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "invalid" | "error">("idle");
  useEffect(() => {
    const consume = () => {
      const value = window.location.hash.replace(/^#/, "");
      if (TOKEN.test(value)) {
        setToken(value);
        setState("idle");
      } else if (!value) {
        setState((current) => (current === "idle" ? "invalid" : current));
      } else setState("invalid");
      // Keep the token out of the address bar, history and screenshots.
      if (value) window.history.replaceState(window.history.state, "", "/workspace/unsubscribe");
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
  }, []);
  async function confirm() {
    if (!token || state === "sending") return;
    setState("sending");
    try {
      const response = await fetch("/api/evals/v1/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { unsubscribed?: boolean } } | null;
      setState(response.ok && payload?.data?.unsubscribed ? "done" : response.ok ? "invalid" : "error");
    } catch {
      setState("error");
    }
  }
  const done = state === "done";
  return (
    <AuthFrame
      title={done ? t("unsubscribeDoneTitle") : t("unsubscribeTitle")}
      description={done ? t("unsubscribeDoneHelp") : state === "invalid" ? t("unsubscribeInvalid") : t("unsubscribeHelp")}
    >
      {state === "error" && <Status error>{t("unsubscribeError")}</Status>}
      {done ? (
        <Status>{t("unsubscribeSettingsHint")}</Status>
      ) : state === "invalid" ? (
        <Status>{t("unsubscribeSettingsHint")}</Status>
      ) : (
        <Action onClick={() => void confirm()} disabled={!token || state === "sending"}>
          {state === "sending" ? t("saving") : t("unsubscribeConfirm")}
        </Action>
      )}
    </AuthFrame>
  );
}
