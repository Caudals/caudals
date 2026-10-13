"use client";

import { useTranslations } from "@/lib/i18n/context";
import type { NamespaceKeys } from "@/lib/i18n/messages";
import type { DisclosureResult, DisclosureStatus } from "@/lib/evals/scoring/disclosure";
import type { Verdict } from "@/lib/demo/judge";
import { VerdictMark } from "./verdict";

type Key = NamespaceKeys<"demo">;

/** Ink-only marks: a tick for Disclosed, a dash for Not disclosed, a dotted ring for Unclear. Never a cross: this is evidence, not a verdict. */
const MARK: Record<DisclosureStatus, Verdict> = { disclosed: "correct", not_disclosed: "no_answer", unclear: "unscored" };

/** The sentence under the status, from the stored reason (copy never comes from a model). */
export function disclosureReasonKey(result: Pick<DisclosureResult, "status" | "reason">): string {
  if (result.reason === "judge") return result.status === "disclosed" ? "judge_disclosed" : result.status === "not_disclosed" ? "judge_not_disclosed" : "no_signal";
  return result.reason;
}

/**
 * The AI-disclosure check on the demo report (launch L-29, spec P-08): the
 * status, why, the sentence that shows it, and the conversation as evidence.
 * It sits apart from the score and says that it doesn't count toward it.
 */
export function DemoDisclosure({ result }: { result: DisclosureResult }) {
  const t = useTranslations("demo");
  const evidenceTurn = result.evidence?.turn;
  return (
    <section className="dm-disclosure" aria-labelledby="dm-disclosure-title" data-disclosure={result.status}>
      <h2 id="dm-disclosure-title" className="dm-label">{t("disclosure.title")}</h2>
      <p className="dm-disclosure-status">
        <VerdictMark verdict={MARK[result.status]} />
        <span>{t(`disclosure.status.${result.status}` as Key)}</span>
      </p>
      <p className="dm-disclosure-why">{t(`disclosure.reason.${disclosureReasonKey(result)}` as Key)}</p>
      {result.evidence ? (
        <figure className="dm-disclosure-evidence">
          <blockquote className="dm-quote" lang={result.language}>{result.evidence.quote}</blockquote>
          <figcaption className="dm-src">{t(`disclosure.turn.${result.evidence.turn}` as Key)}</figcaption>
        </figure>
      ) : null}
      {result.transcript.length ? (
        <details className="dm-disclosure-chat">
          <summary className="dm-link">{t("disclosure.show")}</summary>
          <dl className="dm-facts">
            {result.transcript.map((turn, index) => (
              <div key={`${turn.kind}-${index}`} data-turn={turn.kind}>
                <dt>{t(`disclosure.turn.${turn.kind}` as Key)}</dt>
                <dd lang={result.language}>
                  {turn.error || !turn.text ? <span className="dm-quiet">{t("disclosure.notCaptured")}</span>
                    : turn.kind === evidenceTurn ? <strong>{turn.text}</strong> : turn.text}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
      <p className="dm-hint">{t("disclosure.context")}</p>
      <p className="dm-hint dm-disclosure-note">{t("disclosure.note")}</p>
    </section>
  );
}
