"use client";

/**
 * Two-factor authentication (TOTP) setup and recovery codes (launch L-08,
 * spec P-43). Platform staff must use it while EVALS_ADMIN_MFA_REQUIRED=true
 * and are sent here at their next sign-in; customers may turn it on.
 *
 * Setup: password → setup key and recovery codes → first code from the app.
 * better-auth turns two-factor on only after that first code verifies, so an
 * abandoned setup never locks anyone out.
 */
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { betterAuthClient } from "./auth-client";
import { AuthFrame } from "./auth-frame";
import { Action, ActionLink, Check, Field, Status } from "./primitives";
import { t } from "@/lib/evals/messages/en";

type Step = "status" | "password" | "setup" | "done";
type ApiError = { status?: number } | null | undefined;

function failure(error: ApiError, fallback: Parameters<typeof t>[0] = "securityError") {
  return t(error?.status === 429 ? "authRateLimited" : fallback);
}

/** The base32 secret inside an otpauth:// URI, grouped in fours for typing. */
export function setupKeyFromUri(uri: string) {
  try {
    const secret = new URL(uri).searchParams.get("secret") ?? "";
    return secret.replace(/(.{4})/g, "$1 ").trim();
  } catch {
    return "";
  }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Action
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {t(copied ? "securityCopied" : "securityCopy")}
    </Action>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="p-stack">
      <h2 className="p-auth-subhead">{t("securityRecoveryTitle")}</h2>
      <p className="p-field-hint">{t("securityRecoveryHelp")}</p>
      <ol className="p-recovery-codes" aria-label={t("securityRecoveryTitle")}>
        {codes.map((code) => <li key={code}><code>{code}</code></li>)}
      </ol>
      <div><CopyButton value={codes.join("\n")} /></div>
    </div>
  );
}

export function TwoFactorSettings({
  email,
  enabled,
  required,
  staff,
  next,
}: {
  email: string;
  enabled: boolean;
  required: boolean;
  staff: boolean;
  next: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(enabled ? "status" : "password");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [manage, setManage] = useState<"codes" | "off" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function run(work: () => Promise<void>) {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await work();
    } catch {
      setError(t("authNetworkError"));
    } finally {
      setPending(false);
    }
  }

  const start = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await betterAuthClient.twoFactor.enable({ password, issuer: "Caudals" });
      if (result.error || !result.data) return setError(failure(result.error));
      setUri(result.data.totpURI);
      setCodes(result.data.backupCodes ?? []);
      setPassword("");
      setStep("setup");
    });
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await betterAuthClient.twoFactor.verifyTotp({ code, trustDevice: false });
      if (result.error || !result.data) return setError(failure(result.error, "totpError"));
      setCode("");
      setStep("done");
      router.refresh();
    });
  };

  const regenerate = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await betterAuthClient.twoFactor.generateBackupCodes({ password });
      if (result.error || !result.data) return setError(failure(result.error));
      setCodes(result.data.backupCodes ?? []);
      setPassword("");
      setManage(null);
    });
  };

  const turnOff = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const result = await betterAuthClient.twoFactor.disable({ password });
      if (result.error) return setError(failure(result.error));
      setPassword("");
      setManage(null);
      setCodes([]);
      setNotice(t("securityOff"));
      setStep("password");
      router.refresh();
    });
  };

  const footer = <Link href={next}>{t("securityBack")}</Link>;

  return (
    <AuthFrame title={t("securityTitle")} description={t(required && !enabled ? "securityRequired" : "securityHelp")} footer={step === "done" ? undefined : footer}>
      <div className="p-auth-form p-two-factor" aria-busy={pending}>
        {notice && <Status tone="info">{notice}</Status>}

        {step === "status" && (
          <>
            <Status tone="success">{t("securityOn")}</Status>
            {codes.length > 0 && <RecoveryCodes codes={codes} />}
            {manage === null && (
              <>
                <Action variant="secondary" block onClick={() => { setManage("codes"); setError(""); }}>{t("securityNewCodes")}</Action>
                {staff && required ? (
                  <p className="p-field-hint">{t("securityStaffKeep")}</p>
                ) : (
                  <Action variant="secondary" block onClick={() => { setManage("off"); setError(""); }}>{t("securityTurnOff")}</Action>
                )}
              </>
            )}
            {manage !== null && (
              <form className="p-stack" onSubmit={manage === "codes" ? regenerate : turnOff}>
                <p className="p-field-hint">{t(manage === "codes" ? "securityNewCodesHelp" : "securityTurnOffHelp")}</p>
                <input type="email" name="email" value={email} readOnly hidden autoComplete="username" />
                <Field id="two-factor-password" type="password" label={t("password")} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required disabled={pending} />
                {error && <Status error>{error}</Status>}
                <Action type="submit" block disabled={pending || !password} variant={manage === "off" ? "danger" : "primary"}>
                  {pending ? t("working") : t(manage === "codes" ? "securityNewCodes" : "securityTurnOff")}
                </Action>
                <Action variant="secondary" block disabled={pending} onClick={() => { setManage(null); setPassword(""); setError(""); }}>{t("cancel")}</Action>
              </form>
            )}
          </>
        )}

        {step === "password" && (
          <form className="p-stack" onSubmit={start}>
            {!required && <Status tone="info">{t("securityOff")}</Status>}
            <p className="p-field-hint">{t("securityPasswordHelp")}</p>
            <input type="email" name="email" value={email} readOnly hidden autoComplete="username" />
            <Field id="two-factor-password" type="password" label={t("password")} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus required disabled={pending} />
            {error && <Status error>{error}</Status>}
            <Action type="submit" block disabled={pending || !password}>{pending ? t("working") : t("securityStart")}</Action>
          </form>
        )}

        {step === "setup" && (
          <form className="p-stack" onSubmit={verify}>
            <p className="p-field-hint">{t("securityStepApp")}</p>
            <div className="p-field">
              <span className="p-field-label" id="two-factor-key-label">{t("securitySetupKey")}</span>
              <div className="p-setup-key">
                <code aria-labelledby="two-factor-key-label">{setupKeyFromUri(uri)}</code>
                <CopyButton value={setupKeyFromUri(uri).replace(/\s/g, "")} />
              </div>
              <a className="p-field-hint" href={uri}>{t("securityOpenApp")}</a>
            </div>
            <RecoveryCodes codes={codes} />
            <Check id="two-factor-saved" label={t("securityRecoverySaved")} checked={saved} onChange={(event) => setSaved(event.target.checked)} />
            <p className="p-field-hint">{t("securityVerifyHelp")}</p>
            <Field id="two-factor-code" label={t("totpCode")} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required disabled={pending} />
            {error && <Status error>{error}</Status>}
            <Action type="submit" block disabled={pending || !saved || code.length < 6}>{pending ? t("verifyingCode") : t("securityConfirm")}</Action>
          </form>
        )}

        {step === "done" && (
          <>
            <Status tone="success">{t("securityDone")}</Status>
            <ActionLink href={next} block>{t("securityContinue")}</ActionLink>
          </>
        )}
      </div>
    </AuthFrame>
  );
}
