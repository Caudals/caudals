"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowRight } from "lucide-react";
import {
  collaborationFormSchema,
  type CollaborationFormValues,
  collaborationFocusAreas,
  collaborationTeamSizes,
  collaborationIndustries,
  collaborationDatasetModalities,
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
  "sell-data": "Monetize company data",
  "buy-dataset": "Acquire a catalogue dataset",
  "custom-dataset": "Build a custom dataset",
  "ai-consulting": "AI consulting",
};

const industryLabels: Record<
  (typeof collaborationIndustries)[number],
  string
> = {
  logistics: "Logistics & Transportation",
  retail: "Retail & E-commerce",
  healthcare: "Healthcare & Life Sciences",
  agriculture: "Agriculture & Agritech",
  fintech: "Fintech & Banking",
  energy: "Energy & Utilities",
  manufacturing: "Manufacturing & IoT",
  "real-estate": "Real Estate & PropTech",
  telecom: "Telecom & Networks",
  insurance: "Insurance",
  other: "Other",
};

const modalityLabels: Record<
  (typeof collaborationDatasetModalities)[number],
  string
> = {
  tabular: "Tabular",
  text: "Text",
  image: "Image",
  video: "Video",
  audio: "Audio",
  geospatial: "Geospatial",
  timeseries: "Time series",
  document: "Document",
};

const defaultValues: Partial<CollaborationFormValues> = {
  fullName: "",
  workEmail: "",
  organization: "",
  organizationWebsite: "",
  focusArea: undefined,
  industry: undefined,
  teamSize: undefined,
  datasetModality: undefined,
  geography: "",
  freshness: "",
  volume: "",
  budgetRange: "",
  timeline: "",
  targetFormats: "",
  sensitivityConstraints: "",
  catalogueListingId: undefined,
  requestedDatasetId: undefined,
  message: "",
};

const minimalInputClass =
  "border-0 border-b border-gray-300 rounded-none px-0 py-2 h-auto bg-transparent focus-visible:ring-0 focus-visible:border-black placeholder:text-gray-400 text-base shadow-none";

const minimalSelectClass =
  "w-full border-0 border-b border-gray-300 rounded-none px-0 py-2 bg-transparent focus-visible:ring-0 focus-visible:border-black text-base shadow-none appearance-none outline-none";

type ContactFormProps = {
  catalogueListingId?: string;
  requestedDatasetId?: string;
};

export function ContactForm({
  catalogueListingId,
  requestedDatasetId,
}: ContactFormProps) {
  const [isComplete, setIsComplete] = useState(false);
  const toast = useLocaleToast();
  const t = useTranslations();
  const formDefaults = useMemo<Partial<CollaborationFormValues>>(
    () => ({
      ...defaultValues,
      focusArea:
        catalogueListingId || requestedDatasetId ? "buy-dataset" : undefined,
      catalogueListingId,
      requestedDatasetId,
    }),
    [catalogueListingId, requestedDatasetId],
  );
  const form = useForm<CollaborationFormValues>({
    resolver: zodResolver(collaborationFormSchema),
    defaultValues: formDefaults,
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
      form.reset(formDefaults);
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
          {t("We'll review your inquiry and reply within 24 hours.")}
        </p>
        <div className="space-y-4 pt-8 border-t border-gray-200">
          <p className="text-base text-gray-600">
            {t("If you want to add more context in the meantime, email us at")}{" "}
            <a
              href="mailto:hello@caudals.com"
              className="text-black hover:underline decoration-1 underline-offset-4"
            >
              hello@caudals.com
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
          <input type="hidden" {...form.register("catalogueListingId")} />
          <input type="hidden" {...form.register("requestedDatasetId")} />

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

          <div className="grid gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="organization"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("Company")}
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
                      placeholder="https://company.com"
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
            name="focusArea"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-sm font-medium text-black">
                  {t("What are you looking for?")}
                </FormLabel>
                <FormControl>
                  <select
                    className={minimalSelectClass}
                    value={field.value ?? ""}
                    onChange={(e) => field.onChange(e.target.value)}
                  >
                    <option value="" disabled hidden>
                      {t("Select an option")}
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

          <div className="grid gap-8 md:grid-cols-2">
            <FormField
              control={form.control}
              name="industry"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("Industry (optional)")}
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
                      <option value="none">{t("Select industry")}</option>
                      {collaborationIndustries.map((ind) => (
                        <option key={ind} value={ind}>
                          {t(industryLabels[ind])}
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
                    {t("Company size (optional)")}
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
                      <option value="none">{t("Select size")}</option>
                      {collaborationTeamSizes.map((size) => (
                        <option key={size} value={size}>
                          {t("{{range}} employees", { range: size })}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-6 border-t border-gray-200 pt-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  {t("Buyer brief")}
                </p>
                <h2 className="mt-2 text-xl font-normal tracking-tight text-black">
                  {t("Dataset requirements")}
                </h2>
              </div>
              {catalogueListingId || requestedDatasetId ? (
                <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                  {t("Catalogue request")}
                </span>
              ) : null}
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <FormField
                control={form.control}
                name="datasetModality"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Dataset type")}
                    </FormLabel>
                    <FormControl>
                      <select
                        className={minimalSelectClass}
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value || undefined)
                        }
                      >
                        <option value="">{t("Select type")}</option>
                        {collaborationDatasetModalities.map((modality) => (
                          <option key={modality} value={modality}>
                            {t(modalityLabels[modality])}
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
                name="geography"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Geography")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("EU, US, global")}
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
                name="freshness"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Freshness")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("Daily, monthly, 24 mo")}
                        className={minimalInputClass}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-8 md:grid-cols-3">
              <FormField
                control={form.control}
                name="volume"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Volume")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("50k rows or 2 TB")}
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
                name="budgetRange"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Budget range")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("$25k-$75k")}
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
                name="timeline"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Timeline")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("Pilot in 30 days")}
                        className={minimalInputClass}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <FormField
                control={form.control}
                name="targetFormats"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Target formats")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("Parquet, JSONL, Snowflake")}
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
                name="sensitivityConstraints"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("Sensitivity constraints")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("PII, PHI, regulated regions")}
                        className={minimalInputClass}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-sm font-medium text-black">
                  {t("Tell us about your project")}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    placeholder={t(
                      "Describe what you need: the data you want to sell, the dataset you're looking for, or the AI project you want to build. Include details like data type, industry, volume, and timeline.",
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
