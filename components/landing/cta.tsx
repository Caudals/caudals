"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";
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
  const toast = useLocaleToast();
  const t = useTranslations();
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
          toast.error(t("Please enter a valid email address."));
          return;
        }
        throw new Error(payload?.error || payload?.message || "Something went wrong");
      }

      const data = (payload ?? {}) as NewsletterResponse;
      setResult(data);

      if (data.newsletter === "already_subscribed") {
        toast.info(t("You're already subscribed! We'll keep the updates coming."));
      } else {
        toast.success(t("Check your inbox to confirm your subscription."));
      }
      form.reset();
    } catch (error) {
      console.error("Failed to submit newsletter form", error);
      toast.error(t("We couldn't save your request. Please try again."));
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
                    aria-label={t("Your email address")}
                    placeholder={t("Your email address")}
                    className="h-12 w-full rounded-full border border-gray-200/80 bg-white/60 px-5 pr-32 text-sm shadow-sm backdrop-blur-sm transition-all focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-200 hover:border-gray-300"
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
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Subscribe")}
          </Button>
        </form>
      </Form>
      {form.formState.errors.email && (
        <p className="mt-2 text-sm text-red-500 font-medium text-center">
          {form.formState.errors.email.message ? t(form.formState.errors.email.message) : ""}
        </p>
      )}
      {!result && !form.formState.errors.email && (
        <p className="mt-3 text-[13px] text-gray-500 text-center">
          {t("Not ready to talk yet? Get our newsletter every two weeks. One click to unsubscribe.")}
        </p>
      )}
      {result && !form.formState.errors.email && (
        <p className="mt-3 text-sm text-teal-700 font-medium text-center">
          {result.newsletter === "already_subscribed"
            ? t("You're already subscribed! We'll keep the updates coming.")
            : t("Check your inbox to confirm your subscription.")}
        </p>
      )}
    </div>
  );
}

export function CTASection() {
  const t = useTranslations();
  const assurances = [
    "EU data processing",
    "Your expert signs the answer key",
    "No commitment to start",
  ];

  return (
    <section className="py-32 sm:py-48 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-5xl px-6 sm:px-8 lg:px-12 text-center">
        <div className="flex flex-col items-center gap-8">
          <p className="text-[13px] font-bold text-teal-600">
            {t("Get started")}
          </p>
          <h2 className="text-5xl font-normal tracking-tight text-black sm:text-7xl max-w-3xl leading-[1.1]">
            {t("Find out what your AI gets wrong before your customers do")}
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-gray-500 leading-relaxed">
            {t(
              "Send us the link to your assistant, or tell us about an internal one. We reply within 24 hours with the right starting point.",
            )}
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center mt-4">
            <Button size="lg" className="h-14 min-w-[240px] rounded-md bg-black text-white hover:bg-black/90 text-base font-bold transition-all hover:scale-[1.02]" asChild>
              <Link href="/contact?offer=reality-check">
                {t("Get a free Reality Check")}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 min-w-[240px] rounded-md border-gray-200 text-black hover:bg-gray-50 text-base font-bold transition-all"
              asChild
            >
              <Link href="/call">{t("Book a 30-minute call")}</Link>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center gap-6 mt-12 text-sm font-medium text-gray-400 sm:flex-row sm:gap-10">
            {assurances.map((assurance) => (
              <div key={assurance} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-teal-500" />
                <span className="text-gray-900">{t(assurance)}</span>
              </div>
            ))}
          </div>
          <div className="mt-16 w-full border-t border-gray-100 pt-16">
            <NewsletterInlineForm />
          </div>
        </div>
      </div>
    </section>
  );
}
