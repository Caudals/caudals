/**
 * First-run onboarding (launch L-06, spec v2 P-01, P-02, P-04): values shared
 * by the server and the platform UI. No secrets and no server imports.
 */

/** Welcome question 1: what the person wants to test. */
export const SYSTEM_TYPES = ["website_chat", "api_assistant", "internal_assistant", "agent", "other"] as const;
export type SystemType = (typeof SYSTEM_TYPES)[number];

/** Welcome question 2: why. */
export const GOALS = ["pre_launch", "monitor_changes", "compare_vendors", "ai_review_evidence"] as const;
export type Goal = (typeof GOALS)[number];

/** The prompt revision the Prepare page uses for automatic test sets; the automatic start uses the same one. */
export const AUTOMATIC_PROMPT_REVISION = "dgx-context-cases-v5";

/** Pages read from the demo's site for the first test set (the website reader's own maximum). */
export const ONBOARDING_PAGE_CAP = 25;

/** Questions asked for when the plan sets no test limit. Free plans set 50. */
export const ONBOARDING_DEFAULT_CASES = 50;

/** The five activation steps, in order. */
export const CHECKLIST_STEPS = ["connect", "sources", "run", "results", "invite"] as const;
export type ChecklistStep = (typeof CHECKLIST_STEPS)[number];

export type WorkspaceOnboarding = {
  /** ONBOARDING_AUTOSTART, read on the server. */
  enabled: boolean;
  /** The workspace was created through self-serve sign-up while onboarding was on. */
  tracked: boolean;
  dismissed: boolean;
  steps: Record<ChecklistStep, boolean>;
  complete: boolean;
  welcome: { pending: boolean; systemType: SystemType | null; goal: Goal | null };
  exampleHidden: boolean;
  firstEvaluationId: string | null;
};

export type ConnectionState = "none" | "unchecked" | "checking" | "ready" | "attention" | "unreachable";
export type SiteState = "none" | "reading" | "ready" | "failed";
export type AutostartStatus = "waiting" | "blocked" | "started" | "superseded" | "expired" | "canceled";

/** One evaluation's first-run state (the "first evaluation" checklist). */
export type FirstEvaluation = {
  enabled: boolean;
  autostart: null | {
    status: AutostartStatus;
    reasonCode: string | null;
    pageLimit: number;
    maxCases: number | null;
    createdAt: string;
    startedAt: string | null;
    generationJobId: string | null;
  };
  connection: { state: ConnectionState; code: string | null; kind: string | null; host: string | null };
  site: { state: SiteState; code: string | null; host: string | null };
  generation: null | { status: string; written: number; target: number; reasonCode: string | null };
  help: null | { id: string; status: "open" | "resolved"; createdAt: string };
};
