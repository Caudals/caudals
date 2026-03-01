"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { User, Briefcase, CheckCircle2, Shield, Sparkles } from "lucide-react";
import { UserRole } from "@/types/database";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { trackFunnelEvent } from "@/lib/analytics/funnel-events";

function getSafeNextPath(value: string | null) {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

function toRoleParam(value: string | null): UserRole | null {
  if (value === "requester" || value === "contributor") {
    return value;
  }

  return null;
}

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const toast = useLocaleToast();
  const t = useTranslations();

  const roleFromQuery = toRoleParam(searchParams.get("role"));
  const nextPath = getSafeNextPath(searchParams.get("next"));
  const [selectedRole, setSelectedRole] = useState<UserRole>(
    roleFromQuery ?? "contributor"
  );

  useEffect(() => {
    if (roleFromQuery) {
      setSelectedRole(roleFromQuery);
    }
  }, [roleFromQuery]);

  const buildAuthCallbackUrl = (role: UserRole) => {
    const query = new URLSearchParams();
    query.set("role", role);

    if (nextPath) {
      query.set("next", nextPath);
    }

    return `${window.location.origin}/auth/callback?${query.toString()}`;
  };

  const roleOptions = [
    {
      value: "contributor" as UserRole,
      label: "Contributor",
      description: "Contribute data to existing dataset requests and earn rewards",
      icon: User,
    },
    {
      value: "requester" as UserRole,
      label: "Requester", 
      description: "Create dataset requests and manage data collection projects",
      icon: Briefcase,
    },
  ];

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: buildAuthCallbackUrl(selectedRole),
          data: {
            role: selectedRole,
          },
        },
      });

      if (error) {
        toast.error(error.message);
      } else {
        await trackFunnelEvent("funnel_signup", {
          method: "email",
          role: selectedRole,
          has_next: Boolean(nextPath),
        });
        toast.success(t("Account created! Please check your email to verify your account."));
        router.push("/auth/sign-in");
      }
    } catch {
      toast.error(t("An unexpected error occurred"));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignUp = async (provider: "google" | "github") => {
    setLoading(true);
    try {
      await trackFunnelEvent("funnel_signup", {
        method: provider,
        role: selectedRole,
        oauth_started: true,
        has_next: Boolean(nextPath),
      });

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: buildAuthCallbackUrl(selectedRole),
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
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-[var(--ds-accent)]" />
              {t("Start building production-grade datasets")}
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight">
              {t("Create your Caudals workspace in minutes")}
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">
              {t(
                "Pick your role now and unlock a guided workflow for dataset requests, contribution pipelines, and payout-ready operations.",
              )}
            </p>
            <div className="mt-8 space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--ds-accent)]" />
                {t("Role-specific onboarding for requesters and contributors")}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-[var(--ds-accent)]" />
                {t("Built-in support for reviews, exports, and activity trails")}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Shield className="h-4 w-4 text-[var(--ds-accent)]" />
                {t("Secure account infrastructure with auditable actions")}
              </div>
            </div>
          </div>
        </section>

        <div className="w-full max-w-md justify-self-center lg:justify-self-end">
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

        <Card className="rounded-3xl border-border/80 shadow-[var(--ds-shadow-overlay)]">
          <CardHeader>
            <CardTitle>{t("Create an account")}</CardTitle>
            <CardDescription>
              {t("Get started with your free account today")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleEmailSignUp} className="space-y-4">
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t("Confirm Password")}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  minLength={6}
                />
              </div>
              
              <div className="space-y-3">
                <Label>{t("Choose your role")}</Label>
                <div className="grid gap-3">
                  {roleOptions.map((option) => {
                    const Icon = option.icon;
                    return (
                      <div
                        key={option.value}
                        className={`relative flex cursor-pointer rounded-lg border p-4 transition-colors hover:bg-muted ${
                          selectedRole === option.value
                            ? "border-border bg-muted/60"
                            : "border-border"
                        }`}
                        onClick={() => setSelectedRole(option.value)}
                      >
                        <div className="flex items-start space-x-3">
                          <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id={option.value}
                                name="role"
                                value={option.value}
                                checked={selectedRole === option.value}
                                onChange={() => setSelectedRole(option.value)}
                                className="h-4 w-4"
                              />
                              <Label
                                htmlFor={option.value}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                              >
                                {t(option.label)}
                              </Label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {t(option.description)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("Creating account...") : t("Sign up")}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">
                  {t("Or continue with")}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => handleOAuthSignUp("google")}
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
                Google
              </Button>
              <Button
                variant="outline"
                onClick={() => handleOAuthSignUp("github")}
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
                GitHub
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-center">
            <p className="text-sm text-muted-foreground">
              {t("Already have an account?")}{" "}
              <Link
                href="/auth/sign-in"
                className="font-medium text-primary hover:underline"
              >
                {t("Sign in")}
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
    </div>
  );
}
