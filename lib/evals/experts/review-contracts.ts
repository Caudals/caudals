/**
 * Expert review requests and orders (launch L-26, spec v2 P-10, P-32, P-33):
 * the shapes shared by the API routes and the screens. No server code here.
 */
import { z } from "zod";
import { SECTOR_IDS } from "@/lib/public/sectors";

/** The sectors Caudals sells to (the public sector pages), plus "other". */
export const REVIEW_SECTORS = [...SECTOR_IDS, "public_sector", "retail", "other"] as const;
export type ReviewSector = (typeof REVIEW_SECTORS)[number];
export const REVIEW_SCOPES = ["failed_answers", "whole_report", "findings", "pilot"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "Use a valid date.");

/** "Have an expert review this": the short form (scope, deadline, sector). */
export const reviewRequestInputSchema = z.strictObject({
  orgId: z.uuid(),
  surface: z.enum(["report", "results"]),
  scopeKind: z.enum(REVIEW_SCOPES),
  scopeNote: z.string().trim().max(1000).nullable().optional(),
  deadline: dateOnly.nullable().optional(),
  sector: z.enum(REVIEW_SECTORS),
  locale: z.enum(["en", "es"]),
});
export type ReviewRequestInput = z.infer<typeof reviewRequestInputSchema>;

/** What the customer sees of their request. */
export type CustomerReviewRequest = {
  id: string;
  status: "requested" | "quoted" | "ordered" | "delivered" | "declined";
  scopeKind: ReviewScope;
  createdAt: string;
  replyDueAt: string;
  dueAt: string | null;
  deliveredAt: string | null;
};

/** Ops turns a request into an order. The price is a hand-written quote, never credits (spec §6.17). */
export const reviewOrderInputSchema = z.strictObject({
  orgId: z.uuid(),
  scope: z.string().trim().min(3).max(300),
  sector: z.enum(REVIEW_SECTORS),
  dueAt: z.iso.datetime({ offset: true }),
  quoteAmount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/),
  quoteCurrency: z.literal("EUR"),
  quoteNote: z.string().trim().min(1).max(4000),
  expertProfileIds: z.array(z.uuid()).min(1).max(5).refine((ids) => new Set(ids).size === ids.length, "Choose each expert once."),
  resultIds: z.array(z.string().min(1).max(200)).min(1).max(100),
  /** The operator confirms each expert declared no conflict of interest with this customer. */
  conflictsCleared: z.literal(true),
});
export type ReviewOrderInput = z.infer<typeof reviewOrderInputSchema>;

/** The expert onboarding checklist (P-33). Dates are ISO timestamps or null. */
const at = z.iso.datetime({ offset: true }).nullable();
export const expertOnboardingInputSchema = z.strictObject({
  credentials_verified_at: at,
  contract_signed_at: at,
  ip_assignment: z.boolean(),
  confidentiality: z.boolean(),
  dpa_signed_at: at,
  trial_gold_items: z.int().min(0).max(10_000).nullable(),
  trial_agreement: z.number().min(0).max(1).nullable(),
  agreement_threshold: z.number().min(0.5).max(1),
  trial_completed_at: at,
  trial_paid_at: at,
  sectors: z.array(z.enum(REVIEW_SECTORS)).max(12),
  availability: z.enum(["available", "limited", "unavailable"]),
  hours_per_week: z.int().min(0).max(60).nullable(),
  notes: z.string().trim().max(2000).nullable(),
}).superRefine((value, context) => {
  if (value.trial_completed_at && (value.trial_gold_items === null || value.trial_agreement === null)) {
    context.addIssue({ code: "custom", path: ["trial_agreement"], message: "A completed trial needs its gold-item count and agreement." });
  }
});
export type ExpertOnboardingInput = z.infer<typeof expertOnboardingInputSchema>;

/** The checklist items that are still missing, in the order ops works through them. */
export function missingOnboarding(row: Partial<ExpertOnboardingInput> | null | undefined): string[] {
  if (!row) return ["credentials", "contract", "ip_assignment", "confidentiality", "dpa", "trial", "availability"];
  const missing: string[] = [];
  if (!row.credentials_verified_at) missing.push("credentials");
  if (!row.contract_signed_at) missing.push("contract");
  if (!row.ip_assignment) missing.push("ip_assignment");
  if (!row.confidentiality) missing.push("confidentiality");
  if (!row.dpa_signed_at) missing.push("dpa");
  if (!row.trial_completed_at || row.trial_agreement == null) missing.push("trial");
  else if (row.trial_agreement < (row.agreement_threshold ?? 0.8)) missing.push("agreement");
  if (!row.availability || row.availability === "unavailable") missing.push("availability");
  return missing;
}

/** SLA state of a due date: overdue, due within a day, or on time. */
export function slaState(due: string | null | undefined, done: boolean, now = Date.now()): "done" | "overdue" | "due_soon" | "on_time" | "none" {
  if (done) return "done";
  if (!due) return "none";
  const left = Date.parse(due) - now;
  if (left < 0) return "overdue";
  return left < 24 * 3_600_000 ? "due_soon" : "on_time";
}
