"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { KeyRound, ShieldCheck } from "lucide-react";

import { betterAuthClient } from "@/lib/auth/better-auth-client";
import type { OperatorSecurityStatus } from "@/lib/auth/operator-security";
import { toast } from "sonner";
import { useInternalTranslations } from "@/lib/i18n/internal";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type OperatorSecuritySetupProps = {
  email: string;
  name: string;
  nextPath: string;
  status: OperatorSecurityStatus;
};

export function OperatorSecuritySetup({
  email,
  name,
  nextPath,
  status: initialStatus,
}: OperatorSecuritySetupProps) {
  const router = useRouter();
  const t = useInternalTranslations();
  const [status, setStatus] = useState(initialStatus);
  const [password, setPassword] = useState("");
  const [totpUri, setTotpUri] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const complete = (nextStatus: OperatorSecurityStatus) => {
    setStatus(nextStatus);
    if (nextStatus.complete) {
      router.push(nextPath);
      router.refresh();
    }
  };

  const enableTotp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await betterAuthClient.twoFactor.enable({
        password,
        issuer: "Caudals",
      });

      if (error) {
        toast.error(error.message ?? t("Unable to enable two-factor authentication"));
        return;
      }

      setTotpUri(data.totpURI);
      setBackupCodes(data.backupCodes ?? []);
      toast.success(t("Authenticator setup started"));
    } catch {
      toast.error(t("An unexpected error occurred"));
    } finally {
      setLoading(false);
    }
  };

  const verifyTotp = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { error } = await betterAuthClient.twoFactor.verifyTotp({
        code: totpCode,
        trustDevice: false,
      });

      if (error) {
        toast.error(error.message ?? t("Invalid authentication code"));
        return;
      }

      const mfaEnabled = true;
      const nextStatus = {
        ...status,
        mfaEnabled,
        complete:
          (!status.mfaRequired || mfaEnabled) &&
          (!status.webauthnRequired || status.webauthnRegistered),
      };
      toast.success(t("Two-factor authentication enabled"));
      complete(nextStatus);
    } catch {
      toast.error(t("An unexpected error occurred"));
    } finally {
      setLoading(false);
    }
  };

  const addPasskey = async () => {
    setLoading(true);

    try {
      const { error } = await betterAuthClient.passkey.addPasskey({
        name: "Caudals production key",
        authenticatorAttachment: "platform",
      });

      if (error) {
        toast.error(error.message ?? t("Unable to add passkey"));
        return;
      }

      const webauthnRegistered = true;
      const nextStatus = {
        ...status,
        webauthnRegistered,
        complete:
          (!status.mfaRequired || status.mfaEnabled) &&
          (!status.webauthnRequired || webauthnRegistered),
      };
      toast.success(t("Passkey added"));
      complete(nextStatus);
    } catch {
      toast.error(t("An unexpected error occurred"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,var(--ds-canvas)_0%,#fff_100%)] px-4 py-10 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl items-center">
        <Card className="w-full rounded-2xl border-border/80 shadow-[var(--ds-shadow-overlay)]">
          <CardHeader>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <CardTitle>{t("Secure operator access")}</CardTitle>
            <CardDescription>
              {name} / {email}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-2 sm:grid-cols-2">
              <SecurityBadge
                label={t("Authenticator")}
                enrolled={status.mfaEnabled}
                required={status.mfaRequired}
                statusLabel={
                  status.mfaEnabled
                    ? t("Ready")
                    : status.mfaRequired
                      ? t("Required")
                      : t("Optional")
                }
              />
              <SecurityBadge
                label={t("Passkey")}
                enrolled={status.webauthnRegistered}
                required={status.webauthnRequired}
                statusLabel={
                  status.webauthnRegistered
                    ? t("Ready")
                    : status.webauthnRequired
                      ? t("Required")
                      : t("Optional")
                }
              />
            </div>

            {!status.mfaEnabled ? (
              <div className="rounded-xl border border-gray-200 p-4">
                {!totpUri ? (
                  <form onSubmit={enableTotp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="security-password">{t("Password")}</Label>
                      <Input
                        id="security-password"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                        minLength={12}
                        disabled={loading}
                      />
                    </div>
                    <Button type="submit" disabled={loading}>
                      <KeyRound className="mr-2 h-4 w-4" />
                      {t("Start authenticator setup")}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={verifyTotp} className="space-y-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                      <p className="break-all font-mono text-xs text-gray-700">
                        {totpUri}
                      </p>
                    </div>
                    {backupCodes.length > 0 ? (
                      <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
                        {backupCodes.map((code) => (
                          <span key={code} className="font-mono text-xs text-amber-900">
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="totp-code">{t("Authenticator code")}</Label>
                      <Input
                        id="totp-code"
                        inputMode="numeric"
                        value={totpCode}
                        onChange={(event) => setTotpCode(event.target.value)}
                        required
                        disabled={loading}
                      />
                    </div>
                    <Button type="submit" disabled={loading}>
                      {t("Verify authenticator")}
                    </Button>
                  </form>
                )}
              </div>
            ) : null}

            {!status.webauthnRegistered ? (
              <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-950">
                    {t("Production passkey")}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {t("Optional hardening for production-role access.")}
                  </p>
                </div>
                <Button type="button" onClick={addPasskey} disabled={loading}>
                  {t("Add passkey")}
                </Button>
              </div>
            ) : null}

            <div className="flex justify-between border-t border-gray-100 pt-4">
              <Link href="/auth/sign-out" className="text-sm text-gray-500 hover:text-gray-900">
                {t("Sign out")}
              </Link>
              <Button
                type="button"
                variant="outline"
                disabled={!status.complete}
                onClick={() => router.push(nextPath)}
              >
                {t("Continue")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SecurityBadge({
  label,
  enrolled,
  required,
  statusLabel,
}: {
  label: string;
  enrolled: boolean;
  required: boolean;
  statusLabel: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
      <span className="text-sm font-medium text-gray-950">{label}</span>
      <Badge
        variant="outline"
        className={
          enrolled
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : required
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-gray-200 bg-gray-50 text-gray-600"
        }
      >
        {statusLabel}
      </Badge>
    </div>
  );
}
