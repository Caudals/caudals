import type { NamespaceKeys, Translator } from "@/lib/i18n/messages";

/**
 * The evaluation model and its public offers.
 *
 * This module holds structure only — ids, ordering, how many bullet points an
 * offer has, and whether it publishes a price. All customer-facing copy lives
 * in `lib/i18n/messages/*.json` under the `howItWorks` and `pricing`
 * namespaces, so a wording change is a message edit and never touches code.
 *
 * `/llms.txt`, the markdown served to agents and the home page structured
 * data read from here. The landing page itself shows no prices.
 */

export type EvaluationStepId = "evaluate" | "report" | "subscribe" | "build";

/** Ordered steps of the evaluation model. */
export const EVALUATION_STEP_IDS = [
  "evaluate",
  "report",
  "subscribe",
  "build",
] as const satisfies readonly EvaluationStepId[];

export type EvaluationOfferId =
  | "realityCheck"
  | "pilotEvaluation"
  | "monthlySubscription";

export type EvaluationOffer = {
  id: EvaluationOfferId;
  /** Value of the `offer` query parameter on `/contact`. */
  slug: string;
  /** "free" publishes a price in structured data; "quoted" publishes none. */
  pricing: "free" | "quoted";
  /** How many `includeN` bullets this offer defines in the message files. */
  includeCount: number;
  /** Whether this offer is the one to lead with when offers are listed. */
  featured: boolean;
};

export const EVALUATION_OFFERS = [
  {
    id: "realityCheck",
    slug: "reality-check",
    pricing: "free",
    includeCount: 3,
    featured: false,
  },
  {
    id: "pilotEvaluation",
    slug: "pilot-evaluation",
    pricing: "quoted",
    includeCount: 5,
    featured: true,
  },
  {
    id: "monthlySubscription",
    slug: "monthly-subscription",
    pricing: "quoted",
    includeCount: 5,
    featured: false,
  },
] as const satisfies readonly EvaluationOffer[];

/**
 * The `includeN` message keys an offer defines, in order.
 *
 * The cast is narrowed to keys that actually exist in the `pricing` namespace,
 * so an offer whose `includeCount` outruns its message entries is caught by
 * `tsc` rather than rendering a raw key on the pricing page.
 */
type PricingKey = NamespaceKeys<"pricing">;
type OfferIncludeKey<Id extends EvaluationOfferId> = Extract<
  PricingKey,
  `offers.${Id}.include${number}`
>;

export function offerIncludeKeys<Id extends EvaluationOfferId>(offer: {
  id: Id;
  includeCount: number;
}) {
  return Array.from(
    { length: offer.includeCount },
    (_, index) => `offers.${offer.id}.include${index + 1}`,
  ) as OfferIncludeKey<Id>[];
}

/** The model and its offers as markdown, for `/llms.txt` and agent pages. */
export function renderEvaluationOverviewMarkdown(t: Translator) {
  const steps = EVALUATION_STEP_IDS.map(
    (id, index) =>
      `${index + 1}. **${t(`howItWorks.steps.${id}.label`)}.** ${t(
        `howItWorks.steps.${id}.description`,
      )}`,
  ).join("\n");

  const offers = EVALUATION_OFFERS.map(
    (offer) =>
      `- **${t(`pricing.offers.${offer.id}.name`)}** — ${t(
        `pricing.offers.${offer.id}.price`,
      )} · ${t(`pricing.offers.${offer.id}.duration`)}. ${t(
        `pricing.offers.${offer.id}.summary`,
      )}`,
  ).join("\n");

  return [
    `## ${t("howItWorks.eyebrow")}`,
    steps,
    `## ${t("pricing.title")}`,
    offers,
    t("pricing.subtitle"),
  ].join("\n\n");
}
