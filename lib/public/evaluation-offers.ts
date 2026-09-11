import type { Translator } from "@/lib/i18n/create-translator";

/**
 * The evaluation model and its public offers, as English source strings.
 *
 * The landing page, `/llms.txt`, the markdown served to agents and the home
 * page structured data all read from here, so a price or scope change is one
 * edit plus its dictionary entry. The founding-customer price is private and
 * deliberately absent.
 */

export type EvaluationStepId = "evaluate" | "report" | "subscribe" | "build";

export type EvaluationStep = {
  id: EvaluationStepId;
  label: string;
  description: string;
};

export const EVALUATION_STEPS: readonly EvaluationStep[] = [
  {
    id: "evaluate",
    label: "Evaluate",
    description:
      "We build a golden test set from your documentation, real customer questions and a 90-minute session with your expert, run it against your system and score every answer.",
  },
  {
    id: "report",
    label: "Report",
    description:
      "A scorecard, every failure explained by its cause, the gaps in your documentation and prioritised fixes, presented in a live readout.",
  },
  {
    id: "subscribe",
    label: "Subscribe",
    description:
      "We re-run the suite every month with new questions and new data, and flag anything that broke since the last run.",
  },
  {
    id: "build",
    label: "Build",
    description:
      "The gaps we find become the datasets that close them, and a re-run proves the score moved.",
  },
];

export type EvaluationOfferId =
  | "reality-check"
  | "pilot-evaluation"
  | "full-evaluation"
  | "monthly-subscription"
  | "dataset-build";

export type EvaluationOffer = {
  id: EvaluationOfferId;
  name: string;
  /** Display price; the dictionary localises its format ("€2,500" → "2.500 €"). */
  price: string;
  priceUnit?: string;
  /** Euros excluding VAT: the fixed fee, the monthly fee, or the minimum for scoped work. */
  amountEur: number;
  billing: "one_off" | "monthly" | "from";
  duration: string;
  summary: string;
  includes: readonly string[];
};

export const EVALUATION_OFFERS: readonly EvaluationOffer[] = [
  {
    id: "reality-check",
    name: "Reality Check",
    price: "Free",
    amountEur: 0,
    billing: "one_off",
    duration: "48 hours",
    summary:
      "Forty questions put to your public assistant, with answers taken from your own public documentation.",
    includes: [
      "Your score and the failure categories",
      "Seven annotated transcripts, each next to the source it contradicts",
      "A six-page report and a 30-minute readout",
    ],
  },
  {
    id: "pilot-evaluation",
    name: "Pilot Evaluation",
    price: "€2,500",
    amountEur: 2500,
    billing: "one_off",
    duration: "2 weeks",
    summary:
      "A golden test set built from your documentation, real customer questions and one session with your expert, run against one system.",
    includes: [
      "150–300 cases signed off by your expert",
      "A scorecard and a report of about 20 pages",
      "Every failure explained by its cause, with prioritised fixes",
      "A live readout with your team",
      "The golden set as JSONL, yours to keep",
    ],
  },
  {
    id: "full-evaluation",
    name: "Full Evaluation",
    price: "€4,900",
    amountEur: 4900,
    billing: "one_off",
    duration: "9–12 days",
    summary:
      "Two systems side by side, such as your current model against a candidate model or vendor, with 300+ cases and adversarial and multilingual packs on systems you authorise.",
    includes: [
      "Everything in the Pilot Evaluation",
      "A side-by-side comparison of both systems",
    ],
  },
  {
    id: "monthly-subscription",
    name: "Monthly subscription",
    price: "€890",
    priceUnit: "/ month",
    amountEur: 890,
    billing: "monthly",
    duration: "Every month",
    summary:
      "The evaluation keeps running as your system, your documents and your vendors change.",
    includes: [
      "A monthly re-run with about 25 new cases",
      "New data from your logs and tickets",
      "Regression alerts and a diff against the last run",
      "A quarterly review",
      "12-month term, cancellable in the first 90 days",
    ],
  },
  {
    id: "dataset-build",
    name: "Dataset build",
    price: "From €8,000",
    amountEur: 8000,
    billing: "from",
    duration: "4–8 weeks",
    summary:
      "We close what the evaluation exposed: missing or contradictory documentation, retrieval-ready data, golden answers and, when the model is yours, training data.",
    includes: [
      "A dataset with schema and provenance",
      "A QA scorecard",
      "A re-run proving the score moved",
    ],
  },
];

export function getEvaluationOffer(id: EvaluationOfferId): EvaluationOffer {
  const offer = EVALUATION_OFFERS.find((item) => item.id === id);
  if (!offer) {
    throw new Error(`Unknown evaluation offer: ${id}`);
  }
  return offer;
}

/** The model and its offers as markdown, for `/llms.txt` and the pages served to agents. */
export function renderEvaluationOverviewMarkdown(t: Translator) {
  const steps = EVALUATION_STEPS.map(
    (step, index) => `${index + 1}. **${t(step.label)}.** ${t(step.description)}`,
  ).join("\n");
  const offers = EVALUATION_OFFERS.map((offer) => {
    const price = offer.priceUnit
      ? `${t(offer.price)} ${t(offer.priceUnit)}`
      : t(offer.price);
    return `- **${t(offer.name)}** — ${price} · ${t(offer.duration)}. ${t(offer.summary)}`;
  }).join("\n");

  return [
    `## ${t("How it works")}`,
    steps,
    `## ${t("Offers and pricing")}`,
    offers,
    t("Fixed prices, excluding VAT. We never bill by the hour."),
  ].join("\n\n");
}
