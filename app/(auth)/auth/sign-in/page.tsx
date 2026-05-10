"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { betterAuthClient } from "@/lib/auth/better-auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { CheckCircle2, Shield, Sparkles } from "lucide-react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useLocaleToast();
  const t = useTranslations();

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await betterAuthClient.signIn.email({
        email,
        password,
        callbackURL: "/admin",
        rememberMe: true,
      });

      if (error) {
        toast.error(error.message ?? t("Unable to sign in"));
      } else if (data?.user) {
        toast.success(t("Signed in successfully!"));
        router.push(data.url ?? "/admin");
        router.refresh();
      }
    } catch {
      toast.error(t("An unexpected error occurred"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,var(--ds-canvas)_0%,#ffffff_100%)] px-4 py-10 sm:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden lg:block">
          <div className="rounded-3xl border border-border/70 bg-card p-10 shadow-[var(--ds-shadow-overlay)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted px-3 py-1 text-xs text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-[var(--ds-accent)]" />
              {t("Enterprise data operations")}
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight">
              {t("Welcome back to your data-collection command center")}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-slate-500">
              {t(
                "Coordinate datasets, contributors, and approvals in one workflow with built-in payout and compliance rails.",
              )}
            </p>
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--ds-accent)]" />
                {t("Private operator console for dataset operations")}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--ds-accent)]" />
                {t("Submission review and export lifecycle visibility")}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Shield className="h-4 w-4 text-[var(--ds-accent)]" />
                {t("Secure auth and auditable payment operations")}
              </div>
            </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="mb-6 text-center">
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

          <Card className="rounded-3xl border-border/80 shadow-[var(--ds-shadow-overlay)]">
            <CardHeader>
              <CardTitle>{t("Welcome back")}</CardTitle>
              <CardDescription>
                {t("Sign in to your account to continue")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleEmailSignIn} className="space-y-4">
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
                <div className="space-y-2">
                  <Label htmlFor="password">{t("Password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder={t("••••••••")}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                  <div className="text-right text-sm">
                    <Link
                      href="/auth/reset-password"
                      className="font-medium text-primary hover:underline"
                    >
                      {t("Forgot your password?")}
                    </Link>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t("Signing in...") : t("Sign in")}
                </Button>
              </form>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-sm text-slate-500">
                {t("Need access?")}{" "}
                <Link
                  href="/contact"
                  className="font-medium text-primary hover:underline"
                >
                  {t("Contact Caudals")}
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
