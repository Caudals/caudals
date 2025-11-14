"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import {
  waitlistFormSchema,
  type WaitlistFormValues,
} from "@/lib/validators/waitlist";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface WaitlistResponse {
  success: boolean;
  message: string;
  alreadyRegistered?: boolean;
  emailSent?: boolean;
}

export function WaitlistSection() {
  const [result, setResult] = useState<WaitlistResponse | null>(null);
  const form = useForm<WaitlistFormValues>({
    resolver: zodResolver(waitlistFormSchema),
    defaultValues: {
      email: "",
      fullName: undefined,
      company: undefined,
      useCase: undefined,
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
          email: values.email,
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
          const emailMessage = detail?.fieldErrors?.email?.[0];
          if (emailMessage) {
            form.setError("email", {
              type: "server",
              message: emailMessage,
            });
          }
          toast.error("Please enter a valid email address.");
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

  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 text-center sm:text-left">
        <div>
          <Badge variant="outline" className="border-transparent bg-primary/10 text-primary">
            Early access
          </Badge>
          <p className="mt-3 text-2xl font-semibold text-slate-900">
            Join the Caudals waitlist
          </p>
          <p className="text-sm text-muted-foreground">
            We announce new cohort openings here first.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-white/80 p-2 shadow-sm sm:flex-row sm:items-center sm:rounded-full sm:p-1.5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="you@company.com"
                        className="h-11 w-full rounded-full border-0 bg-transparent px-4 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="px-4 text-left text-xs" />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="h-11 w-full rounded-full px-6 sm:w-auto"
                disabled={isSubmitting}
              >
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Notify me
              </Button>
            </div>
          </form>
        </Form>

        {result && (
          <p className="text-sm text-primary">
            {result.alreadyRegistered
              ? "You're already on the list—we'll keep the updates coming."
              : "Thanks for joining! We'll reach out soon with next steps."}
          </p>
        )}
      </div>
    </section>
  );
}
