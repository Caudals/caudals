"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowRight } from "lucide-react";
import {
  evaluationCompanySizes,
  evaluationOwnerRoleLabels,
  evaluationOwnerRoles,
  evaluationRequestFormSchema,
  evaluationRequestOfferLabels,
  evaluationRequestOffers,
  evaluationSectorLabels,
  evaluationSectors,
  evaluationSystemStageLabels,
  evaluationSystemStages,
  evaluationSystemTypeLabels,
  evaluationSystemTypes,
  type EvaluationRequestFormValues,
  type EvaluationRequestOffer,
} from "@/lib/validators/evaluation-request";
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
import { toast } from "sonner";
import { useTranslations } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

const defaultValues: Partial<EvaluationRequestFormValues> = {
  fullName: "",
  workEmail: "",
  organization: "",
  organizationWebsite: "",
  companySize: undefined,
  systemType: undefined,
  systemStage: undefined,
  sector: undefined,
  ownerRole: undefined,
  systemAnswers: "",
  systemUrl: "",
  requestedOffer: undefined,
  message: "",
};

const minimalInputClass =
  "border-0 border-b border-gray-300 rounded-none px-0 py-2 h-auto bg-transparent focus-visible:ring-0 focus-visible:border-black placeholder:text-gray-400 text-base shadow-none";

const minimalSelectClass =
  "w-full border-0 border-b border-gray-300 rounded-none px-0 py-2 bg-transparent focus-visible:ring-0 focus-visible:border-black text-base shadow-none appearance-none outline-none";

type SelectOption = { value: string; label: string };

type SelectFieldName =
  | "systemType"
  | "systemStage"
  | "sector"
  | "ownerRole"
  | "companySize"
  | "requestedOffer";

type SelectInputProps = Omit<ComponentProps<"select">, "value" | "onChange"> & {
  options: readonly SelectOption[];
  placeholder: string;
  value?: string;
  onValueChange: (value: string | undefined) => void;
};

/** Native select in the form's underline style; the empty option clears the value. */
function SelectInput({
  options,
  placeholder,
  value,
  onValueChange,
  className,
  ...props
}: SelectInputProps) {
  return (
    <select
      {...props}
      className={cn(minimalSelectClass, !value && "text-gray-400", className)}
      value={value ?? ""}
      onChange={(event) => onValueChange(event.target.value || undefined)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value} className="text-black">
          {option.label}
        </option>
      ))}
    </select>
  );
}

type ContactFormProps = {
  requestedOffer?: EvaluationRequestOffer;
};

export function ContactForm({ requestedOffer }: ContactFormProps) {
  const [isComplete, setIsComplete] = useState(false);
  const t = useTranslations("contact");
  const formDefaults = useMemo<Partial<EvaluationRequestFormValues>>(
    () => ({ ...defaultValues, requestedOffer }),
    [requestedOffer],
  );
  const form = useForm<EvaluationRequestFormValues>({
    resolver: zodResolver(evaluationRequestFormSchema),
    defaultValues: formDefaults,
    mode: "onBlur",
  });

  const isSubmitting = form.formState.isSubmitting;

  /**
   * Builds select options from a value list, reading each label from the
   * `contact.options.<group>` message namespace so the choices are shown in
   * the reader's language while the stored value stays a stable id.
   */
  function optionsFrom<T extends string>(
    group: "systemType" | "sector" | "ownerRole" | "systemStage" | "offer",
    values: readonly T[],
  ): SelectOption[] {
    return values.map((value) => ({
      value,
      label: t(`options.${group}.${value}.label` as Parameters<typeof t>[0]),
    }));
  }

  function renderSelectField(
    name: SelectFieldName,
    label: string,
    placeholder: string,
    options: readonly SelectOption[],
  ) {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem className="space-y-1">
            <FormLabel className="text-sm font-medium text-black">{label}</FormLabel>
            <FormControl>
              <SelectInput
                name={field.name}
                onBlur={field.onBlur}
                value={field.value}
                onValueChange={field.onChange}
                placeholder={placeholder}
                options={options}
              />
            </FormControl>
            <FormMessage className="text-xs" />
          </FormItem>
        )}
      />
    );
  }

  async function onSubmit(values: EvaluationRequestFormValues) {
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
                form.setError(field as keyof EvaluationRequestFormValues, {
                  type: "server",
                  message: messages[0],
                });
              }
            });
          }
          toast.error(t("reviewFields"));
          return;
        }

        const message =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error?: unknown }).error ?? "")
            : t("sendFailed");

        throw new Error(message || "Request failed");
      }

      setIsComplete(true);
      form.reset(formDefaults);
    } catch (error) {
      console.error("Failed to submit contact form", error);
      toast.error(t("sendFailedRetry"));
    }
  }

  if (isComplete) {
    return (
      <div className="py-8 text-center">
        <h2 className="text-2xl font-normal tracking-tight text-black mb-4">
          {t("sentTitle")}
        </h2>
        <p className="text-base text-gray-600 leading-relaxed mb-8">
          {t("sentBody")}
        </p>
        <div className="space-y-4 pt-8 border-t border-black/[0.08]">
          <p className="text-base text-gray-600">
            {t("sentEmailPrefix")}{" "}
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
            {t("sendAnother")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background p-8 sm:p-10 border border-black/[0.08] rounded-xl shadow-xs">
      <Form {...form}>
        <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-8 md:grid-cols-2 items-start">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel className="text-sm font-medium text-black">
                    {t("fullName")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fullNamePlaceholder")}
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
                    {t("workEmail")}
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t("workEmailPlaceholder")}
                      className={minimalInputClass}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>

            <div className="grid gap-8 md:grid-cols-2 items-start">
              <FormField
                control={form.control}
                name="organization"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("company")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("companyPlaceholder")}
                        className={minimalInputClass}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
              {renderSelectField(
                "sector",
                t("sector"),
                t("sectorPlaceholder"),
                optionsFrom("sector", evaluationSectors),
              )}
            </div>

            <div className="space-y-8 border-t border-black/[0.08] pt-8">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  {t("systemHeading")}
                </p>
                <h2 className="mt-2 text-xl font-normal tracking-tight text-black">
                  {t("systemQuestion")}
                </h2>
              </div>

              <div className="grid gap-8 md:grid-cols-2 items-start">
                {renderSelectField(
                  "systemType",
                  t("systemType"),
                  t("systemTypePlaceholder"),
                  optionsFrom("systemType", evaluationSystemTypes),
                )}
                {renderSelectField(
                  "ownerRole",
                  t("systemOwner"),
                  t("systemOwnerPlaceholder"),
                  optionsFrom("ownerRole", evaluationOwnerRoles),
                )}
              </div>

              <FormField
                control={form.control}
                name="systemAnswers"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-sm font-medium text-black">
                      {t("systemAnswers")}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder={t("systemAnswersPlaceholder")}
                        className={cn(minimalInputClass, "resize-none")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <div className="grid gap-8 md:grid-cols-2 items-start">
                {renderSelectField(
                  "requestedOffer",
                  t("startWith"),
                  t("startWithPlaceholder"),
                  optionsFrom("offer", evaluationRequestOffers),
                )}
              </div>
            </div>

          <FormField
            control={form.control}
            name="message"
            render={({ field }) => (
              <FormItem className="space-y-1">
                <FormLabel className="text-sm font-medium text-black">
                  {t("anythingElse")}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={3}
                    placeholder={t("anythingElsePlaceholder")}
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
                {t("sending")}
              </>
            ) : (
              <>
                {t("submit")}
                <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
