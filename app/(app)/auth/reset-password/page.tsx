"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";

type Mode = "request" | "reset";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();
  const toast = useLocaleToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<Mode>("request");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const redirectUrl = useMemo(() => {
    if (typeof window === "undefined") return "/auth/reset-password";
    return `${window.location.origin}/auth/reset-password`;
  }, []);

  useEffect(() => {
    const code = searchParams.get("code");

    // Hash based tokens (older Supabase recovery links): #access_token=...&refresh_token=...&type=recovery
    const hashParams =
      typeof window !== "undefined" && window.location.hash
        ? new URLSearchParams(window.location.hash.substring(1))
        : null;
    const accessToken = hashParams?.get("access_token");
    const refreshToken = hashParams?.get("refresh_token");
    const type = hashParams?.get("type");

    // If we have any recovery token, switch to reset mode
    if (code || (accessToken && refreshToken && type === "recovery")) {
      setMode("reset");
      setVerifying(true);

      const establishSession = async () => {
        try {
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            if (error) throw error;
          } else if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error) throw error;
          }

          // Clean the hash from the URL so refreshes stay clean
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.hash = "";
            router.replace(url.pathname + url.search);
          }

          setSessionReady(true);
        } catch (error) {
          console.error("Failed to establish recovery session", error);
          toast.error(t("Invalid or expired recovery link. Please request a new one."));
          setMode("request");
        } finally {
          setVerifying(false);
        }
      };

      void establishSession();
    } else {
      setSessionReady(false);
      setMode("request");
    }
  }, [searchParams, supabase, router, t, toast]);

  const handleRequestEmail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      setEmailSent(true);
      toast.success(t("Check your email for a recovery link."));
    } catch (error) {
      console.error("resetPasswordForEmail error", error);
      toast.error(t("We couldn't send the recovery email. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sessionReady) {
      toast.error(t("Recovery link not verified. Please use the email link again."));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    if (password.length < 6) {
      toast.error(t("Password must be at least 6 characters"));
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success(t("Your password has been updated. You can sign in now."));
      router.push("/auth/sign-in");
    } catch (error) {
      console.error("updateUser password error", error);
      toast.error(t("We couldn't update your password. Please try the link again."));
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "reset" ? t("Set a new password") : t("Reset your password");
  const description =
    mode === "reset"
      ? t("Create a strong password to secure your account.")
      : t(
          "Enter your email and we'll send you a link to reset your password."
        );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-2xl font-semibold"
          >
            <Image
              src="/caudals_logo_black.svg"
              alt="Caudals logo"
              width={28}
              height={28}
              className="h-7 w-7"
              priority
            />
            <span>Caudals</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "request" && (
              <form onSubmit={handleRequestEmail} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("Email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("you@example.com")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !email}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("Sending link...")}
                    </span>
                  ) : (
                    t("Send reset link")
                  )}
                </Button>
                {emailSent && (
                  <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <MailCheck className="h-4 w-4" />
                      <span>{t("Didn't get it? Check spam or resend.")}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2"
                      onClick={() => void handleRequestEmail()}
                      disabled={loading || !email}
                    >
                      <RefreshCw className="mr-1 h-4 w-4" />
                      {t("Resend")}
                    </Button>
                  </div>
                )}
              </form>
            )}

            {mode === "reset" && (
              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t("New password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading || verifying}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    {t("Confirm new password")}
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading || verifying}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || verifying}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("Updating password...")}
                    </span>
                  ) : verifying ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("Verifying link...")}
                    </span>
                  ) : (
                    t("Update password")
                  )}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <div className="w-full space-y-2 text-center text-sm text-muted-foreground">
              <div className="flex items-center">
                <Separator className="flex-1" />
                <span className="px-3">{t("Remembered your password?")}</span>
                <Separator className="flex-1" />
              </div>
              <Link
                href="/auth/sign-in"
                className="font-medium text-primary hover:underline"
              >
                {t("Back to sign in")}
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
