import type { Translator } from "@/lib/i18n/create-translator";

/**
 * The evaluation model and its public offers, as English source strings.
 *
 * The landing page, `/llms.txt`, the markdown served to agents and the home
 * page structured data all read from here, so an offer change is one edit plus
 * its dictionary entry. Only the free Reality Check has a published price;
 * pilots and subscriptions are quoted on scope.
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
  | "monthly-subscription";

export type EvaluationOffer = {
  id: EvaluationOfferId;
  name: string;
  /** "Free", or "Personalized" for offers quoted on the customer's scope. */
  price: string;
  pricing: "free" | "quoted";
  duration: string;
  summary: string;
  includes: readonly string[];
};

export const EVALUATION_OFFERS: readonly EvaluationOffer[] = [
  {
    id: "reality-check",
    name: "Reality Check",
    price: "Free",
    pricing: "free",
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
    price: "Personalized",
    pricing: "quoted",
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
    id: "monthly-subscription",
    name: "Monthly subscription",
    price: "Personalized",
    pricing: "quoted",
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
];

/** The model and its offers as markdown, for `/llms.txt` and the pages served to agents. */
export function renderEvaluationOverviewMarkdown(t: Translator) {
  const steps = EVALUATION_STEPS.map(
    (step, index) => `${index + 1}. **${t(step.label)}.** ${t(step.description)}`,
  ).join("\n");
  const offers = EVALUATION_OFFERS.map(
    (offer) =>
      `- **${t(offer.name)}** — ${t(offer.price)} · ${t(offer.duration)}. ${t(offer.summary)}`,
  ).join("\n");

  return [
    `## ${t("How it works")}`,
    steps,
    `## ${t("Offers and pricing")}`,
    offers,
    t(
      "The Reality Check is free. Pilots and subscriptions are quoted on your scope before we start, and we never bill by the hour.",
    ),
  ].join("\n\n");
}
