"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { localizePathname } from "@/lib/i18n/routing";
import { getLocale, t } from "@/lib/evals/messages/en";
import { AuthFrame } from "./auth-frame";
import { betterAuthClient } from "./auth-client";
import { Action, Check, Field, Status } from "./primitives";

type SignupLink = { token: string; email: string; workspaceName: string; source?: "demo" | "direct" };
type Result<T> = { data: T } | { error: string | null };

async function post<T>(body: unknown): Promise<Result<T>> {
  const response = await fetch("/api/evals/v1/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json().catch(() => null)) as { data?: T; error?: { code?: string } } | null;
  if (!response.ok || !payload?.data) return { error: payload?.error?.code ?? null };
  return { data: payload.data };
}

/** "I accept the {terms} and the {privacy}." with both documents linked on the public site. */
function TermsLabel({ marketingOrigin }: { marketingOrigin: string }) {
  const locale = getLocale();
  const links: Record<string, ReactNode> = {
    "{terms}": (
      <a className="p-link" href={`${marketingOrigin}${localizePathname("/legal/terms", locale)}`} target="_blank" rel="noopener noreferrer">
        {t("signupTermsLink")}
      </a>
    ),
    "{privacy}": (
      <a className="p-link" href={`${marketingOrigin}${localizePathname("/legal/privacy", locale)}`} target="_blank" rel="noopener noreferrer">
        {t("signupPrivacyLink")}
      </a>
    ),
  };
  return t("signupTermsLabel")
    .split(/(\{terms\}|\{privacy\})/)
    .map((part, index) => <span key={index}>{links[part] ?? part}</span>);
}

/**
 * The last step of the public demo's sign-up: the emailed link proves the
 * address, so the person only chooses a name and a password. The token is
 * read from the fragment once and removed from the address bar.
 *
 * With `termsRequired` (SIGNUP_TERMS_REQUIRED, read on the server), the person
 * must accept the Terms and the Privacy Policy; the API records the versions.
 * Links from direct sign-up (launch L-05) carry `source: "direct"` and read
 * without the demo; with `directSignup` (SELF_SERVE_DIRECT_SIGNUP) an
 * expired link offers a new one from `/workspace/start`. With `onboarding`
 * (ONBOARDING_AUTOSTART, launch L-06) the form says what happens next: a demo
 * is imported and its full test set starts preparing by itself.
 */
/**
 * A plain strength reading for the password hint (launch L-06): length first,
 * then variety. The server still enforces only the 12-character minimum.
 */
export function passwordStrength(password: string): "weak" | "fair" | "strong" {
  if (password.length < 12) return "weak";
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  const unique = new Set(password.toLowerCase()).size;
  if (unique < 6) return "weak";
  if (password.length >= 16 || (password.length >= 12 && classes >= 3)) return "strong";
  return "fair";
}

const STRENGTH_COPY = { weak: "passwordStrengthWeak", fair: "passwordStrengthFair", strong: "passwordStrengthStrong" } as const;

export function SelfServeSignup({ termsRequired = false, directSignup = false, onboarding = false, marketingOrigin }: { termsRequired?: boolean; directSignup?: boolean; onboarding?: boolean; marketingOrigin: string }) {
  const [link, setLink] = useState<SignupLink | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "taken" | "creating">("checking");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = /^#([A-Za-z0-9_-]{43})$/.exec(window.location.hash)?.[1];
    window.history.replaceState(window.history.state, "", "/workspace/signup");
    const lookup = token ? post<{ email: string; workspaceName: string; source?: "demo" | "direct" }>({ token }) : Promise.resolve(null);
    void lookup.then((result) => {
      if (!token || !result || !("data" in result)) { setState("invalid"); return; }
      setLink({ token, ...result.data });
      setState("ready");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!link || state === "creating") return;
    if (termsRequired && !accepted) { setError(t("signupTermsRequired")); return; }
    setState("creating");
    setError("");
    try {
      const result = await post<{ email: string; orgId: string; evaluationId: string | null }>({
        token: link.token,
        name: name.trim(),
        password,
        ...(termsRequired ? { acceptTerms: accepted, locale: getLocale() } : {}),
      });
      if (!("data" in result)) {
        if (result.error === "TERMS_REQUIRED") { setError(t("signupTermsRequired")); setState("ready"); return; }
        setState(result.error === "SIGNUP_DOMAIN_TAKEN" ? "taken" : "invalid");
        return;
      }
      const created = result.data;
      const signedIn = await betterAuthClient.signIn.email({ email: created.email, password, rememberMe: true });
      setPassword("");
      const destination = created.evaluationId
        ? `/workspace/evaluations/${created.evaluationId}?orgId=${created.orgId}`
        : `/workspace/evaluations?orgId=${created.orgId}`;
      window.location.assign(signedIn.error ? `/workspace/sign-in?next=${encodeURIComponent(destination)}` : destination);
    } catch {
      setError(t("authNetworkError"));
      setState("ready");
    }
  }

  return (
    <AuthFrame
      title={t("signupTitle")}
      description={t(link?.source === "direct" ? "signupHelpDirect" : "signupHelp")}
      footer={<Link href="/workspace/sign-in">{t("signupExisting")}</Link>}
    >
      {state === "checking" ? (
        <Status tone="info">{t("signupChecking")}</Status>
      ) : state === "taken" ? (
        <Status tone="warn">{t("signupDomainTaken")}</Status>
      ) : (state === "invalid" || !link) && directSignup ? (
        <Status tone="warn" action={<Link className="p-link" href="/workspace/start">{t("signupRequestNew")}</Link>}>
          {t("signupInvalidDirect")}
        </Status>
      ) : state === "invalid" || !link ? (
        <Status tone="warn">{t("signupInvalid")}</Status>
      ) : (
        <form onSubmit={submit} className="p-auth-form" aria-busy={state === "creating"}>
          <Field id="signup-email" label={t("signupEmail")} value={link.email} readOnly autoComplete="username" />
          <Field id="signup-workspace" label={t("signupWorkspace")} value={link.workspaceName} readOnly />
          <Field id="signup-name" label={t("fullName")} value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" maxLength={120} disabled={state === "creating"} />
          <Field
            id="signup-password"
            label={t("password")}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            required
            disabled={state === "creating"}
            hint={`${t("passwordHelp")} ${t("passwordStrengthHelp")}`}
          />
          {password ? (
            <p className="p-field-hint" id="signup-password-strength" data-strength={passwordStrength(password)} aria-live="polite">
              {t(STRENGTH_COPY[passwordStrength(password)])}
            </p>
          ) : null}
          {termsRequired ? (
            <Check
              id="signup-terms"
              name="acceptTerms"
              label={<TermsLabel marketingOrigin={marketingOrigin} />}
              checked={accepted}
              onChange={(event) => { setAccepted(event.target.checked); if (event.target.checked) setError(""); }}
              required
              disabled={state === "creating"}
            />
          ) : null}
          {error ? <Status error>{error}</Status> : null}
          {onboarding ? (
            <p className="p-field-hint" data-testid="signup-next">
              <strong>{t("signupNextTitle")}:</strong> {t(link.source === "direct" ? "signupNextDirect" : "signupNextDemo")}
            </p>
          ) : null}
          <Action block type="submit" disabled={state === "creating" || !name.trim() || password.length < 12 || (termsRequired && !accepted)}>
            {state === "creating" ? t("signupCreating") : t("signupCreate")}
          </Action>
        </form>
      )}
    </AuthFrame>
  );
}
