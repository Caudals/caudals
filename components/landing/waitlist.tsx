"use client";

import { useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, Mail, Sparkles, ShieldCheck, Timer } from "lucide-react";

import {
  waitlistFormSchema,
  type WaitlistFormValues,
} from "@/lib/validators/waitlist";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WaitlistResponse {
  success: boolean;
  message: string;
  alreadyRegistered?: boolean;
  emailSent?: boolean;
}

export function WaitlistSection() {
  return (
    <section className="relative px-6 pb-20 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[420px] w-full max-w-4xl -translate-x-1/2 rounded-full blur-3xl" />
      </div>
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <Badge variant="outline" className="bg-primary/10 text-primary">
            Early access
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Join the Caudals waitlist
          </h2>
          <p className="text-lg text-muted-foreground">
            We onboard teams in cohorts to ensure dedicated support during your
            first dataset launch. Share your details and we will reach out with
            a tailored plan for your use case.
          </p>
          <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-2">
            <FeatureItem icon={<Sparkles className="h-4 w-4 text-primary" />}>
              Priority onboarding and launch playbooks
            </FeatureItem>
            <FeatureItem
              icon={<ShieldCheck className="h-4 w-4 text-primary" />}
            >
              Security and compliance consultation
            </FeatureItem>
            <FeatureItem icon={<Mail className="h-4 w-4 text-primary" />}>
              Early product updates and roadmap previews
            </FeatureItem>
            <FeatureItem icon={<Timer className="h-4 w-4 text-primary" />}>
              48-hour response time for qualified teams
            </FeatureItem>
          </div>
        </div>
        <WaitlistFormCard />
      </div>
    </section>
  );
}

interface FeatureItemProps {
  icon: ReactNode;
  children: ReactNode;
}

function FeatureItem({ icon, children }: FeatureItemProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/60 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <p className="leading-snug text-slate-700">{children}</p>
    </div>
  );
}

function WaitlistFormCard() {
  const [result, setResult] = useState<WaitlistResponse | null>(null);
  const form = useForm<WaitlistFormValues>({
    resolver: zodResolver(waitlistFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      company: "",
      useCase: "",
    },
    mode: "onBlur",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: WaitlistFormValues) {
    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...values,
          company: values.company?.trim() ?? "",
          useCase: values.useCase?.trim() ?? "",
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 422 && payload && typeof payload === "object") {
          const detail = (
            payload as {
              details?: { fieldErrors?: Record<string, string[]> };
            }
          ).details;
          if (detail?.fieldErrors) {
            Object.entries(detail.fieldErrors).forEach(([field, messages]) => {
              if (messages?.length) {
                form.setError(field as keyof WaitlistFormValues, {
                  type: "server",
                  message: messages[0],
                });
              }
            });
          }
          toast.error("Please fix the highlighted fields and try again.");
          return;
        }

        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof (payload as { error: unknown }).error === "string"
            ? (payload as { error: string }).error
            : payload &&
                typeof payload === "object" &&
                "message" in payload &&
                typeof (payload as { message: unknown }).message === "string"
              ? (payload as { message: string }).message
              : "Something went wrong";

        throw new Error(message);
      }

      const data = (payload ?? {}) as WaitlistResponse;

      setResult(data);

      if (data.alreadyRegistered) {
        toast.info("You're already on the waitlist!");
      } else {
        toast.success("You're on the waitlist! We'll be in touch soon.");
      }

      form.reset();
    } catch (error) {
      console.error("Failed to submit waitlist form", error);
      toast.error("We couldn't save your request. Please try again.");
    }
  }

  if (result) {
    return (
      <WaitlistSuccessCard result={result} onReset={() => setResult(null)} />
    );
  }

  return (
    <Card className="border border-border/60 bg-white/90 shadow-xl backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Sparkles className="h-5 w-5 text-primary" />
          Request early access
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input placeholder="Ada Lovelace" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Work email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company</FormLabel>
                    <FormControl>
                      <Input placeholder="Caudals AI" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="useCase"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      What dataset are you planning to launch?
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Share a sentence or two about the dataset you want to build."
                        className="min-h-[120px] resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Join the waitlist
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              We will only use your information to contact you about early
              access.
            </p>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

interface WaitlistSuccessCardProps {
  result: WaitlistResponse;
  onReset: () => void;
}

function WaitlistSuccessCard({ result, onReset }: WaitlistSuccessCardProps) {
  return (
    <Card className="border border-emerald-200 bg-emerald-50/80 shadow-lg">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-emerald-900">
            {result.alreadyRegistered
              ? "You're already on the waitlist"
              : "Thanks for joining the waitlist"}
          </h3>
          <p className="text-sm text-emerald-800">
            {result.alreadyRegistered
              ? "We have your details on file and will keep you updated."
              : result.emailSent
                ? "We just sent a confirmation to your inbox. We'll reach out soon with next steps."
                : "We'll review your request and get back to you shortly."}
          </p>
        </div>
        <Button variant="outline" onClick={onReset} className="w-full">
          Submit another request
        </Button>
      </CardContent>
    </Card>
  );
}
