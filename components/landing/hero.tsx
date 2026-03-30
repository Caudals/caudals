"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  LayoutDashboard,
  Database,
  ListChecks,
  Wallet,
  Settings,
  Search,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

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
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Join Waitlist")}
          </Button>
        </form>
      </Form>
      {form.formState.errors.email && (
        <p className="mt-2 text-sm text-red-500 font-medium text-center">
          {form.formState.errors.email.message ? t(form.formState.errors.email.message) : ""}
        </p>
      )}
      {result && !form.formState.errors.email && (
        <p className="mt-2 text-sm text-teal-700 font-medium text-center">
          {result.alreadyRegistered
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
    t("No onboarding fees"),
    t("Pay only for approvals"),
    t("Human QA included"),
  ];

  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 pt-16 pb-12 sm:px-8 lg:px-12 lg:pt-24">
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center text-center sm:-mt-8 lg:-mt-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="mb-6"
        >
          <div className="inline-flex items-center gap-2 rounded-md border border-teal-200/30 bg-white/40 backdrop-blur-md px-4 py-1.5 text-[13px] font-bold text-teal-900 shadow-sm">
            <div className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-pulse" />
            <span>{t("Supported by leading AI companies")}</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: "easeOut" }}
          className="text-balance text-5xl font-normal tracking-tight text-black sm:text-7xl lg:text-8xl"
        >
          {t("Professional datasets for AI")}{" "}
          <span className="font-serif italic text-teal-700/90">{t("tailored")}</span>
        </motion.h1>


        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl"
        >
          {t(
            "Caudals connects ML teams with certified contributors, reviewer pods, and automated payouts for faster, compliant dataset sprints.",
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

  return (
    <div className="group relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl border border-gray-200/60 bg-white/72 p-1 shadow-[0_48px_120px_-56px_rgba(15,23,42,0.62)] backdrop-blur-2xl transition-all hover:shadow-[0_56px_132px_-60px_rgba(15,23,42,0.7)]">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/30 px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
            <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
            <div className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          </div>
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Dataset Operations Control</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 rounded-md bg-teal-50 px-2 py-1">
            <div className="h-1 w-1 rounded-full bg-teal-600 animate-pulse" />
            <span className="text-[10px] font-bold text-teal-800 uppercase">Live Ops</span>
          </div>
          <div className="h-6 w-px bg-gray-100" />
          <User className="h-4 w-4 text-gray-400" />
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row">
        <aside className="hidden w-56 border-r border-gray-100 p-6 lg:block text-left">
          <div className="space-y-8">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-4">Workspace</div>
              <div className="space-y-3">
                <div className="h-8 w-full rounded-md bg-teal-50 text-teal-800 border border-teal-100 flex items-center px-3 gap-2">
                  <LayoutDashboard className="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">Dashboard</span>
                </div>
                {[
                  { icon: Database, label: "Datasets" },
                  { icon: ListChecks, label: "Quality Lab" },
                  { icon: Wallet, label: "Payouts" },
                  { icon: Settings, label: "Settings" }
                ].map((nav, i) => (
                  <div key={i} className="h-8 w-full rounded-md flex items-center px-3 gap-2 group/nav hover:bg-gray-50/50 transition-colors text-gray-500 hover:text-black cursor-pointer">
                    <nav.icon className="h-3.5 w-3.5" />
                    <span className="text-xs font-bold">{nav.label}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Storage</span>
                <span className="text-[10px] font-bold text-teal-700">82%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full w-[82%] bg-teal-600" />
              </div>
              <div className="mt-2 text-[10px] text-gray-400 font-medium">1.2 TB / 1.5 TB used</div>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-8 sm:p-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
            {[
              { label: "Active Contributors", value: "1,284", delta: "+12%", color: "text-black" },
              { label: "QA Pass Rate", value: "98.2%", delta: "+0.4%", color: "text-teal-700" },
              { label: "Weekly Throughput", value: "42.5k", delta: "+18%", color: "text-black" },
            ].map((stat, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-5 bg-gray-50/30 backdrop-blur-sm">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{t(stat.label)}</div>
                <div className="flex items-baseline gap-2">
                  <div className={`text-2xl font-normal tracking-tight ${stat.color}`}>{stat.value}</div>
                  <div className="text-[10px] font-bold text-teal-700">{stat.delta}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-8 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-black uppercase tracking-widest">Active Sprints</h3>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                  <div className="h-8 w-40 rounded-md border border-gray-100 bg-white/50 pl-8 text-xs flex items-center text-gray-400">Search datasets...</div>
                </div>
                <div className="h-8 w-8 rounded-md bg-black flex items-center justify-center">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 overflow-hidden bg-white/30 backdrop-blur-sm">
              <div className="bg-gray-50/50 px-6 py-3 border-b border-gray-100 flex items-center">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] w-full gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <span>Dataset Name</span>
                  <span className="text-center">Type</span>
                  <span className="text-right">Volume</span>
                  <span className="text-right">Status</span>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { name: "Medical Imaging Sprint", type: "Computer Vision", volume: "12.4k", quality: 99.4, status: "Active" },
                  { name: "Multimodal Voice Pack", type: "Audio", volume: "8.2k", quality: 97.8, status: "Reviewing" },
                  { name: "ADAS Sensor Calibration", type: "Lidar/Sensor", volume: "15.1k", quality: 98.1, status: "Active" },
                ].map((row, i) => (
                  <div key={i} className="px-6 py-4 hover:bg-white/50 transition-colors">
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] w-full gap-4 items-center">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-teal-500" />
                        <span className="text-sm font-bold text-black truncate">{t(row.name)}</span>
                      </div>
                      <div className="text-[11px] font-medium text-gray-500 text-center">{row.type}</div>
                      <div className="text-[11px] font-bold text-black text-right">{row.volume}</div>
                      <div className="flex justify-end">
                        <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${row.status === 'Active' ? 'bg-teal-50 text-teal-800' : 'bg-gray-100 text-gray-500'}`}>
                          {t(row.status)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
