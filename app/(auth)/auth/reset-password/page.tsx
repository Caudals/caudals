"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, MailCheck, RefreshCw } from "lucide-react";
import { betterAuthClient } from "@/lib/auth/better-auth-client";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations();
  const toast = useLocaleToast();
  const token = searchParams.get("token");
  const tokenError = searchParams.get("error");
  const mode: Mode = token ? "reset" : "request";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const redirectUrl = useMemo(() => {
    if (typeof window === "undefined") return "/auth/reset-password";
    return `${window.location.origin}/auth/reset-password`;
  }, []);

  const handleRequestEmail = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);

    try {
      const { error } = await betterAuthClient.requestPasswordReset({
        email,
        redirectTo: redirectUrl,
      });

      if (error) {
        throw error;
      }

      setEmailSent(true);
      toast.success(t("Check your email for a recovery link."));
    } catch (error) {
      console.error("requestPasswordReset error", error);
      toast.error(t("We couldn't send the recovery email. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      toast.error(t("Recovery link not verified. Please use the email link again."));
      return;
    }

    if (password !== confirmPassword) {
      toast.error(t("Passwords do not match"));
      return;
    }

    if (password.length < 12) {
      toast.error(t("Password must be at least 12 characters"));
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await betterAuthClient.resetPassword({
        newPassword: password,
        token,
      });

      if (error) {
        throw error;
      }

      if (!data?.status) {
        throw new Error("Password reset was not accepted");
      }

      toast.success(t("Your password has been updated. You can sign in now."));
      router.push("/auth/sign-in");
    } catch (error) {
      console.error("resetPassword error", error);
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
              alt={t("Caudals logo")}
              width={28}
              height={28}
              className="h-7 w-7"
              priority
            />
            <span>{t("Caudals")}</span>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tokenError && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t("This recovery link has expired. Please request a new one.")}
              </div>
            )}

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
                  <div className="flex items-center justify-between rounded-md border border-dashed p-3 text-sm text-slate-500">
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
                    placeholder={t("••••••••")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    {t("Confirm new password")}
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder={t("••••••••")}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("Updating password...")}
                    </span>
                  ) : (
                    t("Update password")
                  )}
                </Button>
              </form>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <div className="w-full space-y-2 text-center text-sm text-slate-500">
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
