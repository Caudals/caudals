"use client";

/**
 * "Confirm it's you" for sensitive platform changes (provider keys). The
 * server asks for a recent sign-in; instead of sending the person away, this
 * dialog re-checks their password (and authenticator code when two-factor is
 * on) in place, then the caller retries the change. The session never ends.
 */
import { useCallback, useRef, useState, type FormEvent } from "react";
import { Action, Field, Status } from "./primitives";
import { Modal } from "./overlays";
import { betterAuthClient } from "./auth-client";
import { useWorkspace } from "./workspace-context";
import { t } from "@/lib/evals/messages/en";

export function useReauth() {
  const { userEmail } = useWorkspace();
  const pending = useRef<((ok: boolean) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const confirm = useCallback(() => new Promise<boolean>((resolve) => {
    pending.current = resolve;
    setOpen(true);
  }), []);
  const finish = useCallback((ok: boolean) => {
    setOpen(false);
    pending.current?.(ok);
    pending.current = null;
  }, []);
  const dialog = open ? <ReauthDialog email={userEmail} onDone={finish} /> : null;
  return { confirm, dialog };
}

function ReauthDialog({ email, onDone }: { email: string; onDone: (ok: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      if (challenge) {
        const result = await betterAuthClient.twoFactor.verifyTotp({ code, trustDevice: false });
        if (result.error || !result.data) { setError(t("totpError")); return; }
      } else {
        const result = await betterAuthClient.signIn.email({ email, password, rememberMe: true });
        if (result.error) { setError(t("reauthWrongPassword")); return; }
        if ((result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
          setChallenge(true);
          setPassword("");
          return;
        }
      }
      onDone(true);
    } catch {
      setError(t("authNetworkError"));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(value) => !value && onDone(false)}
      title={t("reauthTitle")}
      description={challenge ? t("totpHelp") : t("reauthHelp")}
      size="sm"
      footer={
        <>
          <Action variant="secondary" onClick={() => onDone(false)}>{t("cancel")}</Action>
          <Action type="submit" form="reauth-form" disabled={pending || (challenge ? code.length < 6 : !password)}>
            {pending ? t("working") : t("reauthConfirm")}
          </Action>
        </>
      }
    >
      <form id="reauth-form" className="p-stack" onSubmit={submit} autoComplete="on">
        {error && <Status error>{error}</Status>}
        <input type="email" name="email" value={email} readOnly hidden autoComplete="username" />
        {challenge ? (
          <Field id="reauth-code" label={t("totpCode")} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus required />
        ) : (
          <Field id="reauth-password" type="password" label={t("password")} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required hint={email} />
        )}
      </form>
    </Modal>
  );
}
