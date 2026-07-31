"use client";

import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Database,
  LayoutDashboard,
  Search,
  Settings,
  SlidersHorizontal,
  Wallet,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroSplineScene } from "@/components/landing/hero-spline-scene";
import { useTranslations } from "@/lib/i18n/use-translations";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { waitlistFormSchema, type WaitlistFormValues } from "@/lib/validators/waitlist";
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

interface WaitlistResponse {
  success: boolean;
  message?: string;
  alreadyRegistered?: boolean;
  emailSent?: boolean;
  /** Double opt-in state for The Data Gap; the same box now does both. */
  newsletter?: "pending" | "already_subscribed" | "unavailable";
}

function HeroWaitlistForm() {
  const [result, setResult] = useState<WaitlistResponse | null>(null);
  const toast = useLocaleToast();
  const t = useTranslations();
  const form = useForm<WaitlistFormValues>({
    resolver: zodResolver(waitlistFormSchema),
    defaultValues: {
      email: "",
    },
    mode: "onSubmit",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: WaitlistFormValues) {
    try {
      setResult(null);

      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
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

      const data = (payload ?? {}) as WaitlistResponse;
      setResult(data);

      if (data.alreadyRegistered) {
        toast.info(t(data.message ?? "You're already on the waitlist!"));
      } else {
        toast.success(
          t(
            data.message ??
              (data.emailSent
                ? "You're on the waitlist! Check your inbox for a confirmation email."
                : "You're on the waitlist! We'll be in touch soon."),
          ),
        );
      }
      form.reset();
    } catch (error) {
      console.error("Failed to submit waitlist form", error);
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
                    placeholder={t("Enter your email")}
                    className="h-12 w-full rounded-full border border-gray-200/80 bg-white/60 px-5 pr-36 text-sm shadow-sm backdrop-blur-sm transition-all focus-visible:border-gray-300 focus-visible:ring-1 focus-visible:ring-gray-200 hover:border-gray-300"
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
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Request access")}
          </Button>
        </form>
      </Form>
      {form.formState.errors.email && (
        <p className="mt-2 text-sm text-red-500 font-medium text-center">
          {form.formState.errors.email.message ? t(form.formState.errors.email.message) : ""}
        </p>
      )}
      {!result && !form.formState.errors.email && (
        <p className="mt-2 text-xs text-gray-500 text-center">
          {t(
            "Early access plus The Data Gap, our biweekly read on AI tools and how we work with data. One click to unsubscribe.",
          )}
        </p>
      )}
      {result && !form.formState.errors.email && (
        <p className="mt-2 text-sm text-teal-700 font-medium text-center">
          {result.newsletter === "pending"
            ? t("Almost there — click the link in your inbox to confirm.")
            : result.alreadyRegistered
              ? t("You're already on the list—we'll keep the updates coming.")
              : result.emailSent
                ? t(
                    result.message ??
                      "You're on the waitlist! Check your inbox for a confirmation email.",
                  )
                : t("Thanks for joining! We'll reach out soon with next steps.")}
        </p>
      )}
    </div>
  );
}

export function HeroSection() {
  const t = useTranslations();

  const heroHighlights = [
    t("Enterprise-grade processing"),
    t("GDPR-compliant pipelines"),
    t("Revenue share for suppliers"),
  ];
  const heroTitle = t("Professional datasets for AI");
  const heroTitleHighlight = t("tailored");

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center bg-white px-6 pt-16 pb-24 sm:px-8 lg:px-12 lg:pt-24 lg:pb-32">
      <div className="pointer-events-none absolute inset-0 z-0 opacity-85 overflow-hidden">
        <HeroSplineScene />
      </div>
      
      {/* Bottom gradient fade for smooth transition to the next section */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-48 bg-gradient-to-t from-white to-transparent" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center">
        <motion.h1
          aria-label={`${heroTitle} ${heroTitleHighlight}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="text-balance text-5xl font-normal tracking-tight text-black sm:text-7xl lg:text-8xl"
        >
          {heroTitle}{" "}
          <span className="font-serif italic text-teal-700/90">{heroTitleHighlight}</span>
        </motion.h1>


        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl"
        >
          {t(
            "We source, process, and deliver ML-ready datasets so your team can build models faster.",
          )}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
          className="mt-10 w-full"
        >
          <HeroWaitlistForm />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-medium text-gray-400"
        >
          {heroHighlights.map((highlight) => (
            <div key={highlight} className="flex items-center gap-2.5">
              <div className="h-1.5 w-1.5 rounded-full bg-teal-600/40" />
              <span className="text-gray-900">{highlight}</span>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          className="mt-16 w-full"
        >
          <HeroPreview />
        </motion.div>
      </div>
    </section>
  );
}

function HeroPreview() {
  const t = useTranslations();

  const navItems = [
    { icon: LayoutDashboard, label: "Dashboard", active: true },
    { icon: Database, label: "Catalog" },
    { icon: Workflow, label: "Pipelines" },
    { icon: Wallet, label: "Billing" },
    { icon: Settings, label: "Settings" },
  ];

  const stats = [
    { label: "Supplier Companies", value: "142", delta: "+18", accent: false },
    { label: "Quality score", value: "98.4", unit: "%", delta: "+0.6", accent: true },
    { label: "Datasets Delivered", value: "1,284", delta: "+24", accent: false },
  ];

  const datasets = [
    {
      name: "Retail Transaction Patterns",
      sector: "E-commerce",
      records: "2.4M",
      status: "available" as const,
    },
    {
      name: "Fleet GPS Routes — Spain",
      sector: "Logistics",
      records: "840K",
      status: "in_progress" as const,
    },
    {
      name: "Crop Yield Records 2020-25",
      sector: "Agriculture",
      records: "1.1M",
      status: "available" as const,
    },
  ];

  return (
    <div className="group relative mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200/70 bg-white/85 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.55)] backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 bg-white/40 px-5 py-3.5">
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            <div className="h-2 w-2 rounded-full bg-gray-200" />
            <div className="h-2 w-2 rounded-full bg-gray-200" />
            <div className="h-2 w-2 rounded-full bg-gray-200" />
          </div>
          <div className="hidden h-3.5 w-px bg-gray-200/80 sm:block" />
          <div className="hidden items-baseline gap-2 sm:flex">
            <span className="text-xs text-gray-400">{t("Operational overview")}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-gray-400 sm:inline">
            {t("Synced 2 min ago")}
          </span>
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-[10px] font-medium tracking-tight text-gray-500">
            MM
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[14rem_1fr]">
        <aside className="hidden border-r border-gray-100 bg-white/30 px-3 py-6 text-left lg:block">
          <div className="px-3 text-[11px] font-medium text-gray-400">{t("Workspace")}</div>
          <nav className="mt-3 space-y-0.5">
            {navItems.map((item) => (
              <div
                key={item.label}
                className={`flex h-9 items-center gap-3 rounded-md px-3 text-[13px] transition-colors ${
                  item.active
                    ? "bg-teal-50/70 text-teal-900"
                    : "text-gray-500 hover:bg-gray-50/70 hover:text-gray-900"
                }`}
              >
                <item.icon
                  className={`h-4 w-4 ${
                    item.active ? "text-teal-700" : "text-gray-400"
                  }`}
                />
                <span className="font-medium">{t(item.label)}</span>
                {item.active && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-600/80" />
                )}
              </div>
            ))}
          </nav>

          <div className="mx-1 mt-8 rounded-lg border border-gray-100 bg-gray-50/40 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-gray-500">
                {t("Datasets")}
              </span>
              <span className="text-base font-normal tracking-tight text-gray-900">24</span>
            </div>
            <div className="mt-3 flex h-1 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full w-[71%] bg-teal-600/85" />
              <div className="h-full w-[29%] bg-gray-200" />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
                {t("17 delivered")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-200" />
                {t("7 in progress")}
              </span>
            </div>
          </div>
        </aside>

        <main className="p-6 sm:p-8 ">
          <div className="flex flex-col items-start gap-1">
            <h3 className="text-base font-medium tracking-tight text-gray-900 text-left">
              {t("Operational overview")}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 text-left">{t("Last 30 days")}</p>
          </div>
     

          <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={`rounded-xl border p-5 text-left ${
                  stat.accent
                    ? "border-teal-100 bg-teal-50/40"
                    : "border-gray-100 bg-white/60"
                }`}
              >
                <div className="text-xs font-medium text-gray-500">{t(stat.label)}</div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span
                    className={`text-[26px] font-normal leading-none tracking-tight ${
                      stat.accent ? "text-teal-800" : "text-gray-900"
                    }`}
                  >
                    {stat.value}
                  </span>
                  {stat.unit && (
                    <span className="text-base font-normal text-gray-500">{stat.unit}</span>
                  )}
                </div>
                <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700">
                  <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
                  {stat.delta}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium tracking-tight text-gray-900">
                {t("Catalog")}
              </h4>
              <div className="flex items-center gap-2">
                <div className="relative hidden sm:block">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <div className="flex h-7 w-44 items-center rounded-md border border-gray-200/80 bg-white pl-8 pr-3 text-[12px] text-gray-400">
                    {t("Search datasets")}
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-[12px] font-medium text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-900"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {t("Filters")}
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-100 bg-white/50">
              <div className="grid grid-cols-[2fr_1.1fr_0.8fr_0.9fr] gap-4 border-b border-gray-100 px-5 py-2.5 text-[11px] font-medium text-gray-500 bg-gray-50/40">
                <span className="text-left">{t("Dataset")}</span>
                <span className="text-left">{t("Sector")}</span>
                <span className="text-left">{t("Records")}</span>
                <span className="text-left">{t("Status")}</span>
              </div>
              <ul className="divide-y divide-gray-100">
                {datasets.map((row) => {
                  const isAvailable = row.status === "available";
                  return (
                    <li
                      key={row.name}
                      className="grid grid-cols-[2fr_1.1fr_0.8fr_0.9fr] items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/40"
                    >
                      <span className="truncate text-[13px] font-medium text-gray-900 text-left">
                        {t(row.name)}
                      </span>
                      <span className="truncate text-[12px] text-gray-500 text-left">
                        {t(row.sector)}
                      </span>
                      <span className="text-[12px] font-medium tabular-nums text-gray-700 text-left">
                        {row.records}
                      </span>
                      <div className="flex items-center justify-start gap-1.5">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isAvailable ? "bg-teal-600" : "bg-amber-500"
                          }`}
                        />
                        <span
                          className={`text-[11px] font-medium ${
                            isAvailable ? "text-teal-700" : "text-amber-700"
                          }`}
                        >
                          {isAvailable ? t("Available") : t("In progress")}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
        
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
