"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowRight } from "lucide-react";
import {
  collaborationFormSchema,
  type CollaborationFormValues,
  collaborationFocusAreas,
  collaborationTeamSizes,
} from "@/lib/validators/collaboration";
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
import { useLocaleToast } from "@/lib/i18n/use-locale-toast";
import { useTranslations } from "@/lib/i18n/use-translations";
import { cn } from "@/lib/utils";

const focusAreaLabels: Record<
  (typeof collaborationFocusAreas)[number],
  string
> = {
  "data-collection": "Dataset program or pilot",
  "joint-research": "Research or experimentation",
  "co-marketing": "Pricing, sales, or go-to-market",
  "public-sector": "Public sector or regulated initiative",
  other: "Other",
};

const defaultValues: Partial<CollaborationFormValues> = {
  fullName: "",
  workEmail: "",
  organization: "",
  organizationWebsite: "",
  focusArea: undefined,
  teamSize: undefined,
  message: "",
};

const minimalInputClass =
  "border-0 border-b border-gray-300 rounded-none px-0 py-2 h-auto bg-transparent focus-visible:ring-0 focus-visible:border-black placeholder:text-gray-400 text-base shadow-none";

const minimalSelectClass =
  "w-full border-0 border-b border-gray-300 rounded-none px-0 py-2 bg-transparent focus-visible:ring-0 focus-visible:border-black text-base shadow-none appearance-none outline-none";

export function ContactForm() {
  const [isComplete, setIsComplete] = useState(false);
  const toast = useLocaleToast();
  const t = useTranslations();
  const form = useForm<CollaborationFormValues>({
    resolver: zodResolver(collaborationFormSchema),
    defaultValues,
    mode: "onBlur",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function onSubmit(values: CollaborationFormValues) {
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 422 && payload && typeof payload === "object") {
          const detail = (
            payload as { details?: { fieldErrors?: Record<string, string[]> } }
          ).details;
          if (detail?.fieldErrors) {
            Object.entries(detail.fieldErrors).forEach(([field, messages]) => {
              if (messages?.length) {
                form.setError(field as keyof CollaborationFormValues, {
                  type: "server",
                  message: messages[0],
                });
              }
            });
          }
          toast.error(t("Please review the highlighted fields."));
          return;
        }

        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "")
            : t("We couldn't send your message.");

        throw new Error(message || "Request failed");
      }

      setIsComplete(true);
      form.reset(defaultValues);
    } catch (error) {
      console.error("Failed to submit contact form", error);
      toast.error(t("We couldn't send your message. Please try again."));
    }
  }

  if (isComplete) {
    return (
      <div className="py-8 text-center">
        <h2 className="text-2xl font-normal tracking-tight text-black mb-4">
          {t("Message sent")}
        </h2>
        <p className="text-base text-gray-600 leading-relaxed mb-8">
          {t("We'll review your note and reply within 48 hours.")}
        </p>
        <div className="space-y-4 pt-8 border-t border-gray-200">
          <p className="text-base text-gray-600">
            {t("If you want to add more context in the meantime, email us at")}{" "}
            <a
              href="mailto:contact@caudals.com"
              className="text-black hover:underline decoration-1 underline-offset-4"
            >
              contact@caudals.com
            </a>
          </p>
          <button
            type="button"
            className="text-sm font-medium text-black hover:underline decoration-1 underline-offset-4"
            onClick={() => setIsComplete(false)}
          >
            {t("Send another message")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50/50 p-8 sm:p-10 border border-gray-200 rounded-md">
      <Form {...form}>
        <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("Full name")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("Jane Smith")}
                      className={minimalInputClass}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="workEmail"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("Work email")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("jane@company.com")}
                      className={minimalInputClass}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="organization"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-sm font-medium text-black">
                  {t("Company or organization")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("Acme Corp")}
                    className={minimalInputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="organizationWebsite"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-sm font-medium text-black">
                  {t("Website (optional)")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="https://example.com"
                    className={minimalInputClass}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <div className="grid gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="focusArea"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("Type of inquiry")}
                  </FormLabel>
                  <FormControl>
                    <select
                      className={minimalSelectClass}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value)}
                    >
                      <option value="" disabled hidden>
                        {t("Select focus area")}
                      </option>
                      {collaborationFocusAreas.map((area) => (
                        <option key={area} value={area}>
                          {t(focusAreaLabels[area])}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="teamSize"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("Team size (optional)")}
                  </FormLabel>
                  <FormControl>
                    <select
                      className={minimalSelectClass}
                      value={field.value ?? "none"}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === "none" ? undefined : e.target.value,
                        )
                      }
                    >
                      <option value="none">{t("Prefer not to say")}</option>
                      {collaborationTeamSizes.map((size) => (
                        <option key={size} value={size}>
                          {t("{{range}} people", { range: size })}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-sm font-medium text-black">
                  {t("Context and goals")}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      "Tell us about your dataset goals, timeline, and what you'd like to discuss.",
                    )}
                    className={cn(minimalInputClass, "resize-none")}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full h-14 rounded-md bg-black text-white hover:bg-gray-900 text-base font-medium mt-4"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t("Sending...")}
              </>
            ) : (
              <>
                {t("Send message")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
