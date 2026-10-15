"use client";

/**
 * Entry points to the example evaluation (launch L-33, spec P-55): whether it
 * is offered, the owner's hide/show, and the link, card and settings row the
 * evaluations list, empty states, Home and the onboarding checklist use.
 * Kept apart from the page (./example-evaluation.tsx) so the shell does not
 * load the report view.
 *
 * Owners (and operators) can hide the example from the workspace's lists.
 * The choice is stored per workspace in its onboarding state (launch L-06,
 * migration 086, `PATCH /api/evals/v1/workspace/onboarding` with
 * `hide_example`/`show_example`), shared with the checklist through
 * ./workspace-onboarding-store.
 */
import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import { EyeOff, FlaskConical } from "lucide-react";
import { EXAMPLE_EVALUATION_PATH } from "@/lib/evals/example/public";
import { t } from "@/lib/evals/messages/runtime";
import { Action, ActionLink, Badge, Card, SettingsRow } from "./primitives";
import { notify } from "./overlays";
import { useWorkspace } from "./workspace-context";
import { updateWorkspaceOnboarding, useOnboardingState } from "./workspace-onboarding-store";

/* ----------------------------------------------------------- availability --- */

const Availability = createContext(false);

/** Provided by the shell from the server flag EXAMPLE_EVALUATION_ENABLED. */
export function ExampleAvailability({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <Availability.Provider value={enabled}>{children}</Availability.Provider>;
}

/** Whether the example is offered in the current workspace, and the owner's hide/show. */
export function useExampleEvaluation() {
  const enabled = useContext(Availability);
  const { orgId, canManage, withOrg } = useWorkspace();
  const state = useOnboardingState(orgId, enabled);
  const hidden = !!state?.exampleHidden;
  const change = async (action: "hide_example" | "show_example") => {
    if (!orgId) return;
    try {
      await updateWorkspaceOnboarding(orgId, { action });
      notify(t(action === "hide_example" ? "exampleHiddenToast" : "exampleShownToast"));
    } catch (error) {
      notify(error instanceof Error ? error.message : t("error"));
    }
  };
  return {
    /** The feature is on (EXAMPLE_EVALUATION_ENABLED). */
    available: enabled,
    /** Hidden from this workspace's lists (per workspace, for every member). */
    hidden,
    /** Show it in lists and empty states. */
    visible: enabled && !hidden,
    canHide: enabled && !!orgId && canManage,
    href: withOrg(EXAMPLE_EVALUATION_PATH),
    hide: () => void change("hide_example"),
    show: () => void change("show_example"),
  };
}

/* ---------------------------------------------------------- entry points --- */

/** A link to the example, or nothing when it is off or hidden. For Home, checklists and empty states. */
export function ExampleEvaluationLink({ variant = "text" }: { variant?: "text" | "button" }) {
  const example = useExampleEvaluation();
  if (!example.visible) return null;
  return variant === "button" ? (
    <ActionLink variant="secondary" href={example.href}>
      <FlaskConical aria-hidden="true" />
      {t("exampleOpen")}
    </ActionLink>
  ) : (
    <Link className="p-link" href={example.href}>
      {t("exampleOpen")}
    </Link>
  );
}

/** The example's place in the evaluations list: below the workspace's own evaluations, never counted with them. */
export function ExampleEvaluationCard() {
  const example = useExampleEvaluation();
  if (!example.visible) return null;
  return (
    <Card
      title={t("exampleEvaluationTitle")}
      actions={
        example.canHide ? (
          <Action variant="ghost" size="sm" onClick={example.hide}>
            <EyeOff aria-hidden="true" />
            {t("exampleHide")}
          </Action>
        ) : undefined
      }
    >
      <div className="p-stack">
        <p className="p-row">
          <Badge tone="strong">{t("exampleLabel")}</Badge>
          <span>{t("exampleCardBody")}</span>
        </p>
        <p className="p-cell-meta">{t("exampleSyntheticLine")}</p>
        <div>
          <ActionLink variant="secondary" href={example.href}>
            <FlaskConical aria-hidden="true" />
            {t("exampleOpen")}
          </ActionLink>
        </div>
      </div>
    </Card>
  );
}

/** Settings → General: whether the example is shown in this workspace's lists. */
export function ExampleEvaluationSetting() {
  const example = useExampleEvaluation();
  if (!example.available) return null;
  return (
    <SettingsRow title={t("exampleEvaluationTitle")} description={t("exampleSettingHelp")}>
      <span className="p-row p-nowrap">
        <Badge tone={example.hidden ? "neutral" : "pass"} dot>
          {example.hidden ? t("exampleHidden") : t("exampleShown")}
        </Badge>
        {example.canHide &&
          (example.hidden ? (
            <Action variant="secondary" size="sm" onClick={example.show}>
              {t("exampleShow")}
            </Action>
          ) : (
            <Action variant="secondary" size="sm" onClick={example.hide}>
              {t("exampleHide")}
            </Action>
          ))}
        <Link className="p-link" href={example.href}>
          {t("exampleOpen")}
        </Link>
      </span>
    </SettingsRow>
  );
}
