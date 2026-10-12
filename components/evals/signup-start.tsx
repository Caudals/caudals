"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { localizePathname } from "@/lib/i18n/routing";
import { getLocale, t, tv } from "@/lib/evals/messages/en";
import { AuthFrame } from "./auth-frame";
import { Action, Field, Status } from "./primitives";

type Refusal = "free_mail" | "disposable" | "invalid" | "limited" | "unavailable";

/** "We only use … See the {privacy}." with the policy linked on the public site. */
function PrivacyNote({ marketingOrigin }: { marketingOrigin: string }) {
  const link = (
    <a className="p-link" href={`${marketingOrigin}${localizePathname("/legal/privacy", getLocale())}`} target="_blank" rel="noopener noreferrer">
      {t("signupPrivacyLink")}
    </a>
  );
  return (
    <>
      {t("startPrivacy")
        .split(/(\{privacy\})/)
        .map((part, index) => <span key={index}>{part === "{privacy}" ? link : part}</span>)}
    </>
  );
}

/**
 * Direct sign-up with a work email (launch L-05, `/workspace/start`). The
 * person gives a work email and the company name; the API emails the next
 * step. The confirmation is the same whatever the email says, so the page
 * never reveals whether an account or a workspace already exists. Personal
 * and temporary addresses are refused here, with the public demo as the way
 * to try Caudals without an account.
 */
export function SignupStart({ marketingOrigin }: { marketingOrigin: string }) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [sentTo, setSentTo] = useState("");
  const demoHref = `${marketingOrigin}${localizePathname("/demo", getLocale())}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setRefusal(null);
    try {
      const response = await fetch("/api/evals/v1/signup/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), company: company.trim(), locale: getLocale() }),
      });
      const payload = (await response.json().catch(() => null)) as { data?: { sent?: boolean }; error?: { code?: string; details?: { reason?: string } } } | null;
      if (response.ok && payload?.data?.sent) {
        setSentTo(email.trim());
        setState("sent");
        return;
      }
      const code = payload?.error?.code;
      setRefusal(
        code === "WORK_EMAIL_REQUIRED" ? (payload?.error?.details?.reason === "disposable" ? "disposable" : "free_mail")
        : code === "INPUT_INVALID" ? "invalid"
        : code === "RATE_LIMITED" ? "limited"
        : "unavailable",
      );
      setState("idle");
    } catch {
      setRefusal("unavailable");
      setState("idle");
    }
  }

  const refusalMessage: Record<Refusal, ReactNode> = {
    free_mail: t("startFreeMail"),
    disposable: t("startDisposable"),
    invalid: t("startInvalid"),
    limited: t("startLimited"),
    unavailable: t("startUnavailable"),
  };

  return (
    <AuthFrame
      title={t("startTitle")}
      description={t("startHelp")}
      footer={
        <>
          <p><Link href="/workspace/sign-in">{t("signupExisting")}</Link></p>
          <p>{t("startDemoNote")} <a href={demoHref}>{t("startTryDemo")}</a></p>
        </>
      }
    >
      {state === "sent" ? (
        <div className="p-auth-form">
          <Status tone="success">{tv("startSent", { email: sentTo })}</Status>
          <Action variant="secondary" block onClick={() => { setState("idle"); setSentTo(""); }}>
            {t("startAnother")}
          </Action>
        </div>
      ) : (
        <form className="p-auth-form" onSubmit={submit} aria-busy={state === "sending"}>
          <Field
            id="start-email"
            label={t("startEmail")}
            type="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={email}
            onChange={(event) => { setEmail(event.target.value); setRefusal(null); }}
            required
            disabled={state === "sending"}
            aria-invalid={refusal === "free_mail" || refusal === "disposable" || refusal === "invalid" ? true : undefined}
          />
          <Field
            id="start-company"
            label={t("startCompany")}
            autoComplete="organization"
            maxLength={160}
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            required
            disabled={state === "sending"}
          />
          {refusal ? (
            <Status
              error={refusal !== "free_mail" && refusal !== "disposable"}
              tone={refusal === "free_mail" || refusal === "disposable" ? "warn" : undefined}
              action={refusal === "free_mail" || refusal === "disposable" ? <a className="p-link" href={demoHref}>{t("startTryDemo")}</a> : undefined}
            >
              {refusalMessage[refusal]}
            </Status>
          ) : null}
          <Action block type="submit" disabled={state === "sending" || !email.trim() || !company.trim()}>
            {state === "sending" ? t("startSending") : t("startSubmit")}
          </Action>
          <p className="p-auth-note" style={{ marginTop: 0 }}>
            <PrivacyNote marketingOrigin={marketingOrigin} />
          </p>
        </form>
      )}
    </AuthFrame>
  );
}
