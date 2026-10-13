"use client";

/**
 * The example evaluation in the workspace (launch L-33, spec P-55): a
 * read-only, clearly labelled evaluation of a fictitious insurer's assistant,
 * rendered by the same ReportView as a real report.
 *
 * It is a fixture (lib/evals/example), not a database record, so nothing here
 * calls the API: it cannot be run, edited, shared, scheduled or deleted, and
 * it never counts towards plan limits, credits or activation. Entry points
 * live in ./example-evaluation-links.tsx.
 */
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, EyeOff } from "lucide-react";
import type { ExampleView } from "@/lib/evals/example";
import type { ResultLabel } from "@/lib/evals/reports/contracts";
import { getLocale, t, tv } from "@/lib/evals/messages/en";
import { Action, ActionAnchor, Badge, SectionHeading, Stat, StatGrid, Status } from "./primitives";
import { BarList } from "./charts";
import { ReportView } from "./report-view";
import { ResultBadge } from "./result-labels";
import { useExampleEvaluation } from "./example-evaluation-links";

/* ------------------------------------------------------------------ page --- */

const monthOf = (value: string) => new Intl.DateTimeFormat(getLocale() === "es" ? "es-ES" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
const capital = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

/** Trend and comparison at the top of the example's Overview tab. */
function ExampleHistory({ view, onOpen }: { view: ExampleView; onOpen: (assessmentId: string) => void }) {
  const { trend, comparison } = view;
  return (
    <div className="p-split">
      <section>
        <SectionHeading title={t("exampleTrendTitle")}>{t("exampleTrendHelp")}</SectionHeading>
        <BarList items={trend.map((point) => ({ label: capital(monthOf(point.started_at)), value: point.n_pass, total: point.n_scorable }))} label={t("exampleTrendTitle")} />
      </section>
      <section>
        <SectionHeading title={tv("exampleComparisonTitle", { month: monthOf(comparison.baseline_started_at) })}>{t("exampleComparisonHelp")}</SectionHeading>
        <StatGrid>
          <Stat label={t("improved")} value={comparison.improved} />
          <Stat label={t("regressed")} value={comparison.regressed} />
          <Stat label={t("unchanged")} value={comparison.unchanged} meta={`${t("unassessedPairs")}: ${comparison.unassessed}`} />
        </StatGrid>
        <ul className="p-findings-compact" data-wrap="true" aria-label={t("exampleChangedQuestions")}>
          {comparison.changes.map((change) => (
            <li key={change.case_revision_id}>
              <Badge tone={change.direction === "improved" ? "pass" : "fail"} dot>
                {t(change.direction)}
              </Badge>
              <button type="button" className="p-findings-title p-text-button" onClick={() => onOpen(change.assessment_id)}>
                {change.title}
              </button>
              <span className="p-row p-nowrap">
                <ResultBadge result={{ outcome: "pass", label: change.before as ResultLabel }} />
                <span aria-hidden="true">→</span>
                <ResultBadge result={{ outcome: "pass", label: change.after as ResultLabel }} />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** `/workspace/example`: the reviewed report, its trend and comparison, labelled and read-only. */
export function ExampleEvaluation({ view, pdfHref }: { view: ExampleView; pdfHref: string }) {
  const example = useExampleEvaluation();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [opened, setOpened] = useState<{ id: string | null; key: number }>({ id: params.get("result"), key: 0 });

  const setResult = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (id) next.set("result", id);
      else next.delete("result");
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );
  const open = useCallback(
    (id: string) => {
      setOpened((current) => ({ id, key: current.key + 1 }));
      setResult(id);
    },
    [setResult],
  );
  const history = useMemo(() => <ExampleHistory view={view} onOpen={open} />, [view, open]);

  return (
    <>
      <Status tone="info">
        <strong>{t("exampleLabel")}.</strong> {t("exampleSyntheticLine")} {t("exampleReadOnly")}
      </Status>
      {example.hidden && (
        <Status
          tone="warn"
          action={
            example.canHide ? (
              <Action variant="secondary" size="sm" onClick={example.show}>
                <Eye aria-hidden="true" />
                {t("exampleShow")}
              </Action>
            ) : undefined
          }
        >
          {t("exampleHiddenNotice")}
        </Status>
      )}
      <ReportView
        key={opened.key}
        report={view.report}
        badge={<Badge tone="strong">{t("exampleLabel")}</Badge>}
        overviewIntro={history}
        sample
        initialResult={opened.id}
        initialTab={params.get("tab")}
        onResultChange={setResult}
        actions={
          <>
            <ActionAnchor variant="secondary" href={pdfHref} download>
              <Download aria-hidden="true" />
              {t("exampleDownloadPdf")}
            </ActionAnchor>
            {example.canHide && !example.hidden && (
              <Action variant="ghost" onClick={example.hide}>
                <EyeOff aria-hidden="true" />
                {t("exampleHide")}
              </Action>
            )}
          </>
        }
      />
    </>
  );
}
