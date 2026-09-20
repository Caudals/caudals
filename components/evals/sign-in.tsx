"use client";
import { useState, useRef, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { betterAuthClient } from "./auth-client";
import { useAuthDestination } from "./use-auth-destination";
import { evaluationRecoveryPath } from "./auth-path";
import { AuthFrame } from "./auth-frame";
import { Action, Field, Status } from "./primitives";
import { t } from "@/lib/evals/messages/en";
export function EvaluationSignIn({ next }: { next?: string }) {
  const router = useRouter();
  const destination = useAuthDestination(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (challenge) {
        const result = await betterAuthClient.twoFactor.verifyTotp({
          code,
          trustDevice: false,
        });
        if (result.error || !result.data) {
          setError(t("totpError"));
          return;
        }
      } else {
        const result = await betterAuthClient.signIn.email({
          email: email.trim(),
          password,
          callbackURL: destination.split("#")[0],
          rememberMe: true,
        });
        if (result.error) {
          setError(t("signInError"));
          return;
        }
        const data = result.data as {
          user?: unknown;
          twoFactorRedirect?: boolean;
        } | null;
        if (data?.twoFactorRedirect) {
          setChallenge(true);
          setPassword("");
          return;
        }
        if (!data?.user) {
          setError(t("signInError"));
          return;
        }
      }
      if (destination.includes("#")) window.location.assign(destination);
      else {
        router.push(destination);
        router.refresh();
      }
    } catch {
      setError(t("authNetworkError"));
    } finally {
      setPending(false);
    }
  }
  return (
    <AuthFrame
      title={t(challenge ? "totpTitle" : "signInTitle")}
      description={t(challenge ? "totpHelp" : "signInHelp")}
      footer={
        <>
          {destination.includes("#") && <p>{t("recoveryInvitationHelp")}</p>}
          <p>{t(challenge ? "totpRecoveryHelp" : "invitationOnly")}</p>
        </>
      }
    >
      <form className="p-auth-form" onSubmit={submit} aria-busy={pending}>
        {challenge ? (
          <Field
            ref={codeInput}
            id="totp-code"
            label={t("totpCode")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
            disabled={pending}
          />
        ) : (
          <>
            <Field
              id="signin-email"
              label={t("email")}
              type="email"
              autoComplete="username"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={pending}
            />
            <Field
              id="signin-password"
              label={t("password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={pending}
            />
          </>
        )}
        {error && <Status error>{error}</Status>}
        <Action type="submit" block disabled={pending}>
          {t(
            pending
              ? challenge
                ? "verifyingCode"
                : "signingIn"
              : challenge
                ? "verifyCode"
                : "signInAccount",
          )}
        </Action>
        {challenge && (
          <Action
            variant="secondary"
            block
            disabled={pending}
            onClick={() => {
              setChallenge(false);
              setCode("");
              setError("");
            }}
          >
            {t("restartSignIn")}
          </Action>
        )}
        <p className="p-auth-note" style={{ marginTop: 0 }}>
          <Link href={evaluationRecoveryPath(destination)}>{t("recovery")}</Link>
        </p>
      </form>
    </AuthFrame>
  );
}
