"use client";

/**
 * In-app help: how an evaluation works, what each result means and how to
 * reach Caudals. Opened from the account menu and ⌘K, so the top bar stays
 * free of a help button. Definitions follow docs/evals/grading-engine.md.
 */
import { CalendarDays, Mail } from "lucide-react";
import { ActionAnchor, Badge, SectionHeading } from "./primitives";
import { SidePanel } from "./overlays";
import { getLocale, t } from "@/lib/evals/messages/en";
import { localizePathname } from "@/lib/i18n/routing";

const CONTACT_EMAIL = "hello@caudals.com";
const MARKETING_ORIGIN = "https://caudals.com";

export function HelpPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const callUrl = new URL(localizePathname("/call", getLocale()), MARKETING_ORIGIN).toString();
  const outcomes = [
    { label: t("labelCorrect"), tone: "pass", body: t("helpTermCorrect") },
    { label: t("labelPartiallyCorrect"), tone: "warn", body: t("helpTermPartly") },
    { label: t("labelIncorrect"), tone: "fail", body: t("helpTermIncorrect") },
    { label: t("labelNotAnswered"), tone: "fail", body: t("helpTermNoAnswer") },
  ] as const;

  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={t("help")} description={t("helpDescription")}>
      <section aria-labelledby="help-how">
        <SectionHeading id="help-how" title={t("helpHowTitle")} />
        <ol className="p-list-steps">
          <li>{t("helpHowConnect")}</li>
          <li>{t("helpHowPrepare")}</li>
          <li>{t("helpHowRun")}</li>
          <li>{t("helpHowResults")}</li>
        </ol>
      </section>
      <section aria-labelledby="help-results">
        <SectionHeading id="help-results" title={t("helpResultsTitle")} />
        <ul className="p-plain-list">
          {outcomes.map((item) => (
            <li key={item.label}>
              <Badge tone={item.tone}>{item.label}</Badge> {item.body}
            </li>
          ))}
          <li>{t("helpTermNotScored")}</li>
          <li>{t("helpTermScore")}</li>
          <li>{t("helpTermPreliminary")}</li>
        </ul>
      </section>
      <section aria-labelledby="help-data">
        <SectionHeading id="help-data" title={t("helpDataTitle")} />
        <ul className="p-plain-list">
          <li>{t("helpData1")}</li>
          <li>{t("helpData2")}</li>
          <li>{t("helpData3")}</li>
        </ul>
      </section>
      <section aria-labelledby="help-contact">
        <SectionHeading id="help-contact" title={t("helpContactTitle")}>
          <p>{t("helpContactBody")}</p>
        </SectionHeading>
        <div className="p-toolbar">
          <ActionAnchor variant="secondary" size="sm" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Caudals platform")}`}>
            <Mail aria-hidden="true" />
            {t("helpEmail")}
          </ActionAnchor>
          <ActionAnchor variant="secondary" size="sm" href={callUrl} target="_blank" rel="noopener noreferrer">
            <CalendarDays aria-hidden="true" />
            {t("helpBookCall")}
          </ActionAnchor>
        </div>
      </section>
    </SidePanel>
  );
}
