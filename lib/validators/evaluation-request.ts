import { z } from "zod";

export const evaluationSystemTypes = [
  "customer-assistant",
  "voice-agent",
  "internal-assistant",
  "document-pipeline",
  "product-feature",
  "other",
] as const;

export const evaluationSectors = [
  "insurance",
  "industrial",
  "banking",
  "energy",
  "telecom",
  "healthcare",
  "legal",
  "travel",
  "retail",
  "other",
] as const;

export const evaluationOwnerRoles = [
  "customer-service",
  "digital",
  "after-sales",
  "quality-operations",
  "it-data",
  "management",
  "integrator",
  "other",
] as const;

export const evaluationSystemStages = ["live", "pilot", "planned"] as const;

export const evaluationCompanySizes = ["1-49", "50-199", "200-500", "501+"] as const;

/** Offers a requester can start from; the private founding price is never one of them. */
export const evaluationRequestOffers = [
  "reality-check",
  "pilot-evaluation",
  "full-evaluation",
  "monthly-subscription",
  "not-sure",
] as const;

export type EvaluationSystemType = (typeof evaluationSystemTypes)[number];
export type EvaluationSector = (typeof evaluationSectors)[number];
export type EvaluationOwnerRole = (typeof evaluationOwnerRoles)[number];
export type EvaluationSystemStage = (typeof evaluationSystemStages)[number];
export type EvaluationCompanySize = (typeof evaluationCompanySizes)[number];
export type EvaluationRequestOffer = (typeof evaluationRequestOffers)[number];

// English source labels: the form translates them with `t()`, while the
// operator summary and notification email use them as written.
export const evaluationSystemTypeLabels: Record<EvaluationSystemType, string> = {
  "customer-assistant": "Customer assistant or chatbot",
  "voice-agent": "Voice or IVR agent",
  "internal-assistant": "Internal assistant",
  "document-pipeline": "Document triage or extraction",
  "product-feature": "AI feature in our product",
  other: "Other",
};

export const evaluationSectorLabels: Record<EvaluationSector, string> = {
  insurance: "Insurance and brokerage",
  industrial: "Industrial after-sales and technical support",
  banking: "Banking and finance",
  energy: "Energy and utilities",
  telecom: "Telecommunications",
  healthcare: "Healthcare",
  legal: "Legal and advisory",
  travel: "Travel and transport",
  retail: "Retail and e-commerce",
  other: "Other",
};

export const evaluationOwnerRoleLabels: Record<EvaluationOwnerRole, string> = {
  "customer-service": "Customer service",
  digital: "Digital transformation or digital channel",
  "after-sales": "After-sales or technical support",
  "quality-operations": "Quality or operations",
  "it-data": "IT, data or AI team",
  management: "Management",
  integrator: "An external integrator or agency",
  other: "Other",
};

export const evaluationSystemStageLabels: Record<EvaluationSystemStage, string> = {
  live: "In production",
  pilot: "In pilot",
  planned: "Not launched yet",
};

export const evaluationRequestOfferLabels: Record<EvaluationRequestOffer, string> = {
  "reality-check": "Free Reality Check",
  "pilot-evaluation": "Pilot Evaluation",
  "full-evaluation": "Full Evaluation",
  "monthly-subscription": "Monthly subscription",
  "not-sure": "Not sure yet",
};

function withProtocol(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

const optionalUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(300, { message })
    .transform((value) => (value ? value : undefined))
    .refine(
      (value) => {
        if (!value) {
          return true;
        }
        try {
          const url = new URL(withProtocol(value));
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message },
    )
    .transform((value) => (value ? withProtocol(value) : undefined))
    .optional();

export const evaluationRequestFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, { message: "Please enter your full name" })
    .max(120, { message: "Name is too long" }),
  workEmail: z
    .string()
    .trim()
    .email({ message: "Please enter a valid work email" })
    .max(320, { message: "Email is too long" }),
  organization: z
    .string()
    .trim()
    .min(2, { message: "Organization name is required" })
    .max(160, { message: "Organization name is too long" }),
  organizationWebsite: optionalUrl("Please enter a valid URL"),
  companySize: z.enum(evaluationCompanySizes).optional(),
  systemType: z.enum(evaluationSystemTypes, {
    message: "Please select the type of system",
  }),
  sector: z.enum(evaluationSectors, { message: "Please select your sector" }),
  ownerRole: z.enum(evaluationOwnerRoles, {
    message: "Please select who owns the system",
  }),
  systemStage: z.enum(evaluationSystemStages).optional(),
  systemAnswers: z
    .string({ message: "Tell us briefly what the system answers" })
    .trim()
    .min(10, { message: "Tell us briefly what the system answers" })
    .max(1000, { message: "Keep this under 1,000 characters" }),
  systemUrl: optionalUrl("Please enter a valid URL"),
  requestedOffer: z.enum(evaluationRequestOffers).optional(),
  message: z
    .string()
    .trim()
    .max(2000, { message: "Message is too long" })
    .transform((value) => (value ? value : undefined))
    .optional(),
});

export type EvaluationRequestFormValues = z.infer<typeof evaluationRequestFormSchema>;

/** Reads the `?offer=` hint that pricing and hero links pass to `/contact`. */
export function parseRequestedOffer(
  value: string | undefined,
): EvaluationRequestOffer | undefined {
  return evaluationRequestOffers.find((offer) => offer === value);
}
