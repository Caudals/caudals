"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { betterAuthClient } from "./auth-client";
import {
  evaluationReturnPath,
  evaluationSignInPath,
  evaluationRecoveryPath,
} from "./auth-path";
import { AuthFrame } from "./auth-frame";
import { Field, Status } from "./primitives";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/evals/messages/en";
export function EvaluationResetPassword({
  next,
  token,
  invalid = false,
}: {
  next?: string;
  token?: string;
  invalid?: boolean;
}) {
  const destination = evaluationReturnPath(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [requestingNew, setRequestingNew] = useState(false);
  const resetting = !!token && !invalid && !requestingNew;
  useEffect(() => {
    if (token || invalid)
      window.history.replaceState(
        window.history.state,
        "",
        evaluationRecoveryPath(destination),
      );
  }, [token, invalid, destination]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError("");
    if (resetting && password !== confirmation) {
      setError(t("passwordMismatch"));
      return;
    }
    setPending(true);
    try {
      if (resetting) {
        const result = await betterAuthClient.resetPassword({
          newPassword: password,
          token,
        });
        if (result.error || !result.data?.status) {
          setError(t("resetLinkError"));
          return;
        }
        setPassword("");
        setConfirmation("");
        setDone(true);
      } else {
        const result = await betterAuthClient.requestPasswordReset({
          email: email.trim(),
          redirectTo: `${window.location.origin}${evaluationRecoveryPath(destination)}`,
        });
        if (result.error) {
          setError(t("recoveryError"));
          return;
        }
        setSent(true);
      }
    } catch {
      setError(t("authNetworkError"));
    } finally {
      setPending(false);
    }
  }
  return (
    <AuthFrame
      title={t(resetting ? "newPasswordTitle" : "resetTitle")}
      description={t(resetting ? "newPasswordHelp" : "resetHelp")}
    >
      {done ? (
        <>
          <Status>{t("passwordUpdated")}</Status>
          <Link href={evaluationSignInPath(destination)}>
            {t("signInAccount")}
          </Link>
        </>
      ) : (
        <form className="eval-form" onSubmit={submit} aria-busy={pending}>
          {invalid && <Status error>{t("resetLinkError")}</Status>}
          {resetting ? (
            <>
              <Field
                id="new-password"
                label={t("newPassword")}
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={pending}
                aria-describedby="new-password-help"
              />
              <p id="new-password-help">{t("passwordHelp")}</p>
              <Field
                id="confirm-password"
                label={t("confirmPassword")}
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                disabled={pending}
              />
            </>
          ) : (
            <Field
              id="recovery-email"
              label={t("email")}
              type="email"
              autoComplete="email"
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={pending}
            />
          )}
          {error && <Status error>{error}</Status>}
          {sent && <Status>{t("recoverySent")}</Status>}
          <Button type="submit" disabled={pending}>
            {t(
              pending
                ? "working"
                : resetting
                  ? "updatePassword"
                  : sent
                    ? "resendResetLink"
                    : "sendResetLink",
            )}
          </Button>
          {resetting && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setRequestingNew(true);
                setError("");
                setPassword("");
                setConfirmation("");
              }}
            >
              {t("requestNewLink")}
            </Button>
          )}
          <Link href={evaluationSignInPath(destination)}>
            {t("backToSignIn")}
          </Link>
        </form>
      )}
    </AuthFrame>
  );
}
