"use client";
import { useState, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  evaluationSignInPath,
  invitationPath,
  invitationTokenFromFragment,
} from "./auth-path";
import { t } from "@/lib/evals/messages/en";
import { PageHeading, Field, Status, SessionRecovery } from "./primitives";
import { evalRequest, EvalRequestError } from "./api";
export function InvitationAcceptance({
  authenticated = true,
}: {
  authenticated?: boolean;
}) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const router = useRouter();
  useEffect(() => {
    const consume = () => {
      if (!window.location.hash) return;
      setToken(invitationTokenFromFragment(window.location.hash));
      window.history.replaceState(
        window.history.state,
        "",
        "/workspace/invitations",
      );
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
        authenticated
          ? { token: token.trim() }
          : { token: token.trim(), name: name.trim(), password },
      );
      setPassword("");
      setAccepted(true);
      setToken("");
      if (authenticated) router.refresh();
    } catch (e) {
      setError(
        e instanceof EvalRequestError && e.status === 404
          ? new Error(t("invalidInvite"))
          : e instanceof Error
            ? e
            : new Error(t("invalidInvite")),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="eval-narrow">
      <PageHeading title={t("acceptTitle")}>{t("acceptHelp")}</PageHeading>
      {accepted ? (
        <section className="eval-panel">
          <Status>{authenticated ? t("accepted") : t("enrolled")}</Status>
          <Button asChild>
            <Link
              href={
                authenticated
                  ? "/workspace/evaluations"
                  : evaluationSignInPath()
              }
            >
              {authenticated ? t("continue") : t("signInAccount")}
            </Link>
          </Button>
        </section>
      ) : (
        <form
          onSubmit={accept}
          className="eval-panel eval-form"
          aria-busy={pending}
        >
          {!token && <p>{t("missingToken")}</p>}
          <Field
            id="invitation-token"
            label={t("token")}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
            autoComplete="off"
            type="password"
            disabled={pending}
          />
          {!authenticated && (
            <>
              <Field
                id="enroll-name"
                label={t("fullName")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
                maxLength={120}
                disabled={pending}
              />
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
                aria-describedby="password-help"
              />
              <p id="password-help">{t("passwordHelp")}</p>
            </>
          )}
          {error && <Status error>{error.message}</Status>}
          {error instanceof EvalRequestError && error.status === 401 && (
            <SessionRecovery next={invitationPath(token)} />
          )}
          <Button disabled={pending || !token.trim()} type="submit">
            {pending
              ? authenticated
                ? t("accepting")
                : t("enrolling")
              : authenticated
                ? t("accept")
                : t("enroll")}
          </Button>
          {!authenticated && (
            <Link href={evaluationSignInPath(invitationPath(token))}>
              {t("existingAccount")}
            </Link>
          )}
        </form>
      )}
    </div>
  );
}
