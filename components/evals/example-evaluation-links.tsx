"use client";

/**
 * Entry points to the example evaluation (launch L-33, spec P-55): whether it
 * is offered, the owner's hide/show, and the link, card and settings row the
 * evaluations list, empty states, Home and the onboarding checklist use.
 * Kept apart from the page (./example-evaluation.tsx) so the shell does not
 * load the report view.
 *
 * Owners can hide the example from the workspace's lists. There is no
 * per-workspace preference store without a migration, so the choice is kept
 * on this device (localStorage, like the sidebar state); the onboarding state
 * of launch L-06 is the place to persist it per workspace.
 */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { EyeOff, FlaskConical } from "lucide-react";
import { EXAMPLE_EVALUATION_PATH } from "@/lib/evals/example/public";
import { t } from "@/lib/evals/messages/en";
import { Action, ActionLink, Badge, Card, SettingsRow } from "./primitives";
import { notify } from "./overlays";
import { useWorkspace } from "./workspace-context";

/* ----------------------------------------------------------- availability --- */

const Availability = createContext(false);

/** Provided by the shell from the server flag EXAMPLE_EVALUATION_ENABLED. */
export function ExampleAvailability({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <Availability.Provider value={enabled}>{children}</Availability.Provider>;
}

const STORAGE_KEY = "caudals.example-hidden";
const CHANGE_EVENT = "caudals:example-visibility";

function readHidden(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}
function parseHidden(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(-50) : [];
  } catch {
    return [];
  }
}
function writeHidden(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // Storage blocked (private mode): the choice lasts until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

/** Whether the example is offered in the current workspace, and the owner's hide/show. */
export function useExampleEvaluation() {
  const enabled = useContext(Availability);
  const { orgId, canManage, withOrg } = useWorkspace();
  const raw = useSyncExternalStore(subscribe, readHidden, () => "[]");
  const hidden = !!orgId && parseHidden(raw).includes(orgId);
  return {
    /** The feature is on (EXAMPLE_EVALUATION_ENABLED). */
    available: enabled,
    /** Hidden from this workspace's lists on this device. */
    hidden,
    /** Show it in lists and empty states. */
    visible: enabled && !hidden,
    canHide: enabled && !!orgId && canManage,
    href: withOrg(EXAMPLE_EVALUATION_PATH),
    hide: () => {
      if (!orgId) return;
      writeHidden([...parseHidden(readHidden()).filter((id) => id !== orgId), orgId]);
      notify(t("exampleHiddenToast"));
    },
    show: () => {
      if (!orgId) return;
      writeHidden(parseHidden(readHidden()).filter((id) => id !== orgId));
      notify(t("exampleShownToast"));
    },
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
