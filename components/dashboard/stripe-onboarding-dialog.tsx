"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { submitStripeOnboarding } from "@/lib/actions/payment-actions";

type CountryConfig = {
  label: string;
  currency: string;
  requiresSSN?: boolean;
  requiresRouting?: boolean;
  supportsSwift?: boolean;
};

const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  US: { label: "United States", currency: "usd", requiresSSN: true, requiresRouting: true },
  CA: { label: "Canada", currency: "cad", requiresRouting: true, supportsSwift: true },
  GB: { label: "United Kingdom", currency: "gbp", requiresRouting: true, supportsSwift: true },
  IE: { label: "Ireland", currency: "eur", supportsSwift: true },
  DE: { label: "Germany", currency: "eur", supportsSwift: true },
  FR: { label: "France", currency: "eur", supportsSwift: true },
  ES: { label: "Spain", currency: "eur", supportsSwift: true },
  IT: { label: "Italy", currency: "eur", supportsSwift: true },
  NL: { label: "Netherlands", currency: "eur", supportsSwift: true },
  PT: { label: "Portugal", currency: "eur", supportsSwift: true },
  BE: { label: "Belgium", currency: "eur", supportsSwift: true },
  DK: { label: "Denmark", currency: "dkk", supportsSwift: true },
  NO: { label: "Norway", currency: "nok", supportsSwift: true },
  SE: { label: "Sweden", currency: "sek", supportsSwift: true },
  FI: { label: "Finland", currency: "eur", supportsSwift: true },
  AU: { label: "Australia", currency: "aud", requiresRouting: true, supportsSwift: true },
  NZ: { label: "New Zealand", currency: "nzd", requiresRouting: true, supportsSwift: true },
  SG: { label: "Singapore", currency: "sgd", requiresRouting: true, supportsSwift: true },
  JP: { label: "Japan", currency: "jpy", requiresRouting: true },
  HK: { label: "Hong Kong", currency: "hkd", requiresRouting: true, supportsSwift: true },
};

const onboardingSchema = z
  .object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    email: z.string().email().optional(),
    country: z
      .string()
      .length(2, "Use the 2-letter country code")
      .default("US")
      .transform((val) => val.toUpperCase()),
    currency: z
      .string()
      .length(3, "Use the 3-letter currency code")
      .default("USD")
      .transform((val) => val.toLowerCase()),
    dobDay: z.coerce.number().int().min(1).max(31),
    dobMonth: z.coerce.number().int().min(1).max(12),
    dobYear: z
      .coerce.number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() - 13),
    line1: z.string().min(3, "Address is required"),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State / region is required").optional(),
    postalCode: z.string().min(3, "Postal code required"),
    ssnLast4: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || /^\d{4}$/.test(val), {
        message: "Must be 4 digits",
      }),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(
        (val) => !val || val.replace(/\D/g, "").length >= 6,
        "Phone number looks too short"
      ),
    bankRoutingNumber: z.string().trim().optional(),
    bankAccountNumber: z.string().min(4, "Account number or IBAN required"),
    bankSwiftCode: z
      .string()
      .trim()
      .optional()
      .refine((val) => !val || val.length >= 6, "SWIFT/BIC looks too short"),
    ipAddress: z
      .string()
      .optional()
      .transform((val) => val ?? ""),
    tosAccepted: z
      .boolean()
      .refine((val) => val, "You must accept Stripe Connected Account terms"),
  })
  .superRefine((data, ctx) => {
    const config = COUNTRY_CONFIG[data.country];
    if (config?.requiresSSN && !data.ssnLast4) {
      ctx.addIssue({
        path: ["ssnLast4"],
        code: z.ZodIssueCode.custom,
        message: "SSN last 4 digits are required for this country",
      });
    }
    if (config?.requiresRouting && !data.bankRoutingNumber) {
      ctx.addIssue({
        path: ["bankRoutingNumber"],
        code: z.ZodIssueCode.custom,
        message: "Bank routing number is required for this country",
      });
    }
  });

export type StripeOnboardingFormValues = z.infer<typeof onboardingSchema>;

interface StripeOnboardingDialogProps {
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
  defaultEmail?: string | null;
}

const today = new Date();

const defaultValues: StripeOnboardingFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  country: "US",
  currency: COUNTRY_CONFIG.US.currency,
  dobDay: 1,
  dobMonth: 1,
  dobYear: today.getFullYear() - 20,
  line1: "",
  city: "",
  state: "",
  postalCode: "",
  ssnLast4: undefined,
  phone: "",
  bankRoutingNumber: "",
  bankAccountNumber: "",
  bankSwiftCode: "",
  tosAccepted: false,
  ipAddress: "",
};

export function StripeOnboardingDialog({
  open,
  onClose,
  onCompleted,
  defaultEmail,
}: StripeOnboardingDialogProps) {
  const [isPending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(onboardingSchema),
    defaultValues,
  });

  const watchCountry = form.watch("country");
  const normalizedCountry = watchCountry?.toUpperCase() ?? "US";

  const countryConfig = useMemo(
    () => COUNTRY_CONFIG[normalizedCountry],
    [normalizedCountry]
  );

  useEffect(() => {
    if (defaultEmail) {
      form.setValue("email", defaultEmail);
    }
  }, [defaultEmail, form]);

  useEffect(() => {
    const config = COUNTRY_CONFIG[normalizedCountry];
    if (config) {
      form.setValue("currency", config.currency);
    }
  }, [normalizedCountry, form]);

  const handleSubmit = (rawValues: unknown) => {
    const onboardingValues = rawValues as StripeOnboardingFormValues;
    startTransition(async () => {
      try {
        const result = await submitStripeOnboarding({
          ...onboardingValues,
          country: onboardingValues.country.toUpperCase(),
          currency: onboardingValues.currency.toLowerCase(),
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        toast.success("Stripe payout account created successfully!");
        onCompleted?.();
        onClose();
        form.reset({
          ...defaultValues,
          email: defaultEmail ?? "",
          country: onboardingValues.country.toUpperCase(),
          currency:
            COUNTRY_CONFIG[onboardingValues.country.toUpperCase()]?.currency ??
            onboardingValues.currency.toLowerCase(),
        });
      } catch (error) {
        console.error("Failed to submit Stripe onboarding", error);
        toast.error("Failed to submit onboarding. Please try again.");
      }
    });
  };

  const requiresSSN = countryConfig?.requiresSSN ?? false;
  const requiresRouting = countryConfig?.requiresRouting ?? false;
  const supportsSwift = countryConfig?.supportsSwift ?? false;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set Up Your Payout Account</DialogTitle>
          <DialogDescription>
            Share the minimum details Stripe needs to verify you and enable
            payouts globally.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            className="space-y-6 py-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Personal Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Ada" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Lovelace" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      We&apos;ll send Stripe notifications to this address.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="dobDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Day</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={31}
                          {...field}
                          value={field.value as number | undefined}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dobMonth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Month</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={12}
                          {...field}
                          value={field.value as number | undefined}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="dobYear"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1900}
                          max={today.getFullYear() - 13}
                          {...field}
                          value={field.value as number | undefined}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="ssnLast4"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {requiresSSN
                          ? "SSN Last 4 Digits"
                          : "National ID (optional)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            requiresSSN ? "1234" : "Leave blank if not required"
                          }
                          maxLength={4}
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      {!requiresSSN && (
                        <FormDescription>
                          Provide a local tax or national ID if Stripe requests
                          it.
                        </FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="+44 20 1234 5678" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Payout Details
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="US"
                          {...field}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(event.target.value.toUpperCase())
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Enter your two-letter ISO country code (e.g. US, GB, FR,
                        AU).
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="usd"
                          {...field}
                          value={field.value}
                          onChange={(event) =>
                            field.onChange(event.target.value.toLowerCase())
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Stripe will settle payouts in this currency.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="line1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address</FormLabel>
                    <FormControl>
                      <Input placeholder="123 Market Street" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="Berlin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State / Region (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="CA or Bavaria"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Code</FormLabel>
                      <FormControl>
                        <Input placeholder="94107" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bankAccountNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Number / IBAN</FormLabel>
                      <FormControl>
                        <Input placeholder="IE29AIBK93115212345678" {...field} />
                      </FormControl>
                      <FormDescription>
                        Enter your full account number or IBAN exactly as it
                        appears on your bank statement.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankRoutingNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Routing / Sort Code{" "}
                        {requiresRouting ? "(required)" : "(optional)"}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={
                            requiresRouting ? "e.g. 110000000" : "Leave blank if not used"
                          }
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormDescription>
                        Provide ABA, sort code, or local bank code when
                        applicable.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="bankSwiftCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      SWIFT / BIC {supportsSwift ? "(recommended)" : "(optional)"}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. BOFAUS3N"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Helps Stripe route payouts for international accounts.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>

            <FormField
              control={form.control}
              name="tosAccepted"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      I agree to the Stripe Connect Account Terms
                    </FormLabel>
                    <FormDescription>
                      Required so we can transfer payouts to your bank account.
                    </FormDescription>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center justify-end gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Submitting..." : "Create Account"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
