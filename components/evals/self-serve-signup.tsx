"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { t } from "@/lib/evals/messages/en";
import { AuthFrame } from "./auth-frame";
import { betterAuthClient } from "./auth-client";
import { Action, Field, Status } from "./primitives";

type SignupLink = { token: string; email: string; workspaceName: string };

async function post<T>(body: unknown): Promise<T | null> {
  const response = await fetch("/api/evals/v1/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) return null;
  return ((await response.json()) as { data: T }).data;
}

/**
 * The last step of the public demo's sign-up: the emailed link proves the
 * address, so the person only chooses a name and a password. The token is
 * read from the fragment once and removed from the address bar.
 */
export function SelfServeSignup() {
  const [link, setLink] = useState<SignupLink | null>(null);
  const [state, setState] = useState<"checking" | "ready" | "invalid" | "creating">("checking");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = /^#([A-Za-z0-9_-]{43})$/.exec(window.location.hash)?.[1];
    window.history.replaceState(window.history.state, "", "/workspace/signup");
    const lookup = token ? post<{ email: string; workspaceName: string }>({ token }) : Promise.resolve(null);
    void lookup.then((data) => {
      if (!token || !data) { setState("invalid"); return; }
      setLink({ token, ...data });
      setState("ready");
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!link || state === "creating") return;
    setState("creating");
    setError("");
    try {
      const created = await post<{ email: string; orgId: string; evaluationId: string | null }>({ token: link.token, name: name.trim(), password });
      if (!created) { setState("invalid"); return; }
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
      description={t("signupHelp")}
      footer={<Link href="/workspace/sign-in">{t("signupExisting")}</Link>}
    >
      {state === "checking" ? (
        <Status tone="info">{t("signupChecking")}</Status>
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
            hint={t("passwordHelp")}
          />
          {error ? <Status error>{error}</Status> : null}
          <Action block type="submit" disabled={state === "creating" || !name.trim() || password.length < 12}>
            {state === "creating" ? t("signupCreating") : t("signupCreate")}
          </Action>
        </form>
      )}
    </AuthFrame>
  );
}
