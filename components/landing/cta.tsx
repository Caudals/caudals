"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useTranslations, useTranslator } from "@/lib/i18n/context";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  newsletterFormSchema,
  type NewsletterFormValues,
} from "@/lib/validators/newsletter";

interface NewsletterResponse {
  success: boolean;
  emailSent?: boolean;
  /** Double opt-in: new addresses remain pending until the email link is used. */
  newsletter?: "pending" | "already_subscribed";
}

/** Secondary capture for visitors who are not ready to talk yet. */
function NewsletterInlineForm() {
  const [result, setResult] = useState<NewsletterResponse | null>(null);
  const t = useTranslations("newsletterForm");
  const tCta = useTranslations("cta");
  // Validation messages arrive from the schema as message keys.
  const tRoot = useTranslator();
  const form = useForm<NewsletterFormValues>({
    resolver: zodResolver(newsletterFormSchema),
    defaultValues: {
      email: "",
    },
    mode: "onSubmit",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: NewsletterFormValues) {
    try {
      setResult(null);

      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email, source: "landing_cta" }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 422 && payload?.details?.fieldErrors?.email?.[0]) {
          form.setError("email", { type: "server", message: payload.details.fieldErrors.email[0] });
          toast.error(t("invalidEmail"));
          return;
        }
        throw new Error(payload?.error || payload?.message || "Something went wrong");
      }

      const data = (payload ?? {}) as NewsletterResponse;
      setResult(data);

      if (data.newsletter === "already_subscribed") {
        toast.info(t("alreadySubscribed"));
      } else {
        toast.success(t("confirm"));
      }
      form.reset();
    } catch (error) {
      console.error("Failed to submit newsletter form", error);
      toast.error(t("error"));
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="relative flex items-center">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="w-full space-y-0">
                <FormControl>
                  <Input
                    type="email"
                    aria-label={t("emailPlaceholder")}
                    placeholder={t("emailPlaceholder")}
                    className="h-12 w-full rounded-full border border-black/[0.12] bg-background px-5 pr-32 text-sm shadow-xs transition-all focus-visible:border-teal-600 focus-visible:ring-1 focus-visible:ring-teal-600 hover:border-black/[0.2] text-gray-900 placeholder:text-gray-400"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <Button
            type="submit"
            size="sm"
            disabled={isSubmitting}
            className="absolute right-1 h-10 rounded-full bg-black px-5 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-black/90 disabled:opacity-70"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("subscribe")}
          </Button>
        </form>
      </Form>
      {form.formState.errors.email && (
        <p className="mt-2 text-sm text-red-500 font-medium text-center">
          {form.formState.errors.email.message
            ? tRoot(form.formState.errors.email.message as MessageKey)
            : ""}
        </p>
      )}
      {!result && !form.formState.errors.email && (
        <p className="mt-3 text-[13px] text-gray-500 text-center">
          {tCta("newsletterNote")}
        </p>
      )}
      {result && !form.formState.errors.email && (
        <p className="mt-3 text-sm text-teal-700 font-medium text-center">
          {result.newsletter === "already_subscribed"
            ? t("alreadySubscribed")
            : t("confirm")}
        </p>
      )}
    </div>
  );
}

/** Ordered ids; the copy lives in the message files. */
const assuranceIds = ["eu", "experts", "noCommitment"] as const;

export function CTASection() {
  const t = useTranslations("cta");

  return (
    <section className="py-32 sm:py-48 bg-background border-t border-black/[0.08]">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="flex flex-col items-center gap-8">
          <p className="text-[13px] font-bold text-teal-600">
            {t("getStarted")}
          </p>
          <h2 className="text-5xl font-normal tracking-tight text-black sm:text-7xl max-w-3xl leading-[1.1] text-balance">
            {t("title")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-500 leading-relaxed text-balance">
            {t("subtitle")}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center mt-4">
            <Button size="lg" className="h-14 min-w-[240px] rounded-md bg-black text-white hover:bg-black/90 text-base font-bold transition-all hover:scale-[1.02]" asChild>
              <Link href="/contact?offer=reality-check">
                {t("primaryCta")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 min-w-[240px] rounded-md border-black/[0.12] text-black hover:bg-black/5 text-base font-bold transition-all"
              asChild
            >
              <Link href="/call">{t("secondaryCta")}</Link>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-6 mt-12 text-sm font-medium text-gray-500 sm:flex-row sm:gap-10">
            {assuranceIds.map((id) => (
              <div key={id} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-500" />
                <span className="text-gray-900">
                  {t(`assurances.${id}.label`)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-16 w-full border-t border-black/[0.08] pt-16">
            <NewsletterInlineForm />
          </div>
        </div>
      </div>
    </section>
  );
}
