"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { evaluationSignInPath, invitationPath, invitationTokenFromFragment } from "./auth-path";
import { t } from "@/lib/evals/messages/en";
import { Action, ActionLink, Field, Status, SessionRecovery } from "./primitives";
import { evalRequest, EvalRequestError } from "./api";

/**
 * Accept a private workspace invitation. Signed-in people join directly; new
 * people set their name and password here. The token arrives in the URL
 * fragment, is read once and removed from the address bar.
 */
export function InvitationAcceptance({ authenticated = true }: { authenticated?: boolean }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [fromLink, setFromLink] = useState(false);
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();
  useEffect(() => {
    const consume = () => {
      if (!window.location.hash) return;
      const value = invitationTokenFromFragment(window.location.hash);
      setToken(value);
      setFromLink(!!value);
      window.history.replaceState(window.history.state, "", "/workspace/invitations");
    };
    consume();
    window.addEventListener("hashchange", consume);
    return () => window.removeEventListener("hashchange", consume);
  }, []);
  async function accept(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await evalRequest(
        authenticated ? "/invitations/accept" : "/invitations/enroll",
        "POST",
        authenticated ? { token: token.trim() } : { token: token.trim(), name: name.trim(), password },
      );
      setPassword("");
      setAccepted(true);
      setToken("");
      if (authenticated) router.refresh();
    } catch (e) {
      setError(e instanceof EvalRequestError && e.status === 404 ? new Error(t("invalidInvite")) : e instanceof Error ? e : new Error(t("invalidInvite")));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="p-narrow">
      <div className="p-auth-head">
        <span className="p-empty-mark" aria-hidden="true">
          <MailCheck />
        </span>
        <h1>{t("acceptTitle")}</h1>
        <p>{authenticated ? t("acceptHelp") : t("enrollHelp")}</p>
      </div>
      <div className="p-auth-card">
        {accepted ? (
          <div className="p-stack">
            <Status tone="success">{authenticated ? t("accepted") : t("enrolled")}</Status>
            <ActionLink block href={authenticated ? "/workspace/evaluations" : evaluationSignInPath()}>
              {authenticated ? t("continue") : t("signInAccount")}
            </ActionLink>
          </div>
        ) : (
          <form onSubmit={accept} className="p-auth-form" aria-busy={pending}>
            {!fromLink && (
              <Field
                id="invitation-token"
                label={t("token")}
                hint={t("missingToken")}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoComplete="off"
                type="password"
                disabled={pending}
              />
            )}
            {fromLink && <Status tone="info">{t("invitationDetected")}</Status>}
            {!authenticated && (
              <>
                <Field id="enroll-name" label={t("fullName")} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={120} disabled={pending} />
                <Field
                  id="enroll-password"
                  label={t("password")}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={pending}
                  hint={t("passwordHelp")}
                />
              </>
            )}
            {error && <Status error>{error.message}</Status>}
            {error instanceof EvalRequestError && error.status === 401 && <SessionRecovery next={invitationPath(token)} />}
            <Action block type="submit" disabled={pending || !token.trim()}>
              {pending ? (authenticated ? t("accepting") : t("enrolling")) : authenticated ? t("accept") : t("enroll")}
            </Action>
          </form>
        )}
      </div>
      {!authenticated && !accepted && (
        <p className="p-auth-note">
          <Link href={evaluationSignInPath(invitationPath(token))}>{t("existingAccount")}</Link>
        </p>
      )}
    </div>
  );
}
