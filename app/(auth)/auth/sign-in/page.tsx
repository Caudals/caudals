"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
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
import { Separator } from "@/components/ui/separator";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { CheckCircle2, Shield, Sparkles } from "lucide-react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const toast = useLocaleToast();
  const t = useTranslations();

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
      } else if (data.user) {
        toast.success(t("Signed in successfully!"));

        // Get user profile to determine role-based redirection
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        const userRole = profile?.role;
        let redirectPath = "/requester";

        if (userRole === "admin") {
          redirectPath = "/admin";
        } else if (userRole === "requester") {
          redirectPath = "/requester";
        }

        router.push(redirectPath);
        router.refresh();
      }
    } catch {
      toast.error(t("An unexpected error occurred"));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
      }
      // Note: Don't set loading to false on success, as we're redirecting
    } catch {
      toast.error(t("An unexpected error occurred"));
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
                {t("Role-based workspaces for requester, contributor, and admin")}
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

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-slate-500">
                    {t("Or continue with")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleOAuthSignIn("google")}
                  disabled={loading}
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  {t("Google")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleOAuthSignIn("github")}
                  disabled={loading}
                >
                  <svg
                    className="mr-2 h-4 w-4"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      fillRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t("GitHub")}
                </Button>
              </div>
            </CardContent>
            <CardFooter className="flex justify-center">
              <p className="text-sm text-slate-500">
                {t("Don't have an account?")}{" "}
                <Link
                  href="/auth/sign-up"
                  className="font-medium text-primary hover:underline"
                >
                  {t("Sign up")}
                </Link>
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
