"use client";

import type { DisclosureResult, DisclosureStatus, DisclosureTurnKind } from "@/lib/evals/scoring/disclosure";
import { AI_DISCLOSURE_STATUS_LABEL, AI_DISCLOSURE_TURN_LABEL, aiDisclosureReason } from "@/lib/evals/reports/disclosure";
import { t } from "@/lib/evals/messages/runtime";
import { Badge, SectionHeading, type Tone } from "./primitives";

/**
 * The AI-disclosure check in the product report (launch L-29, spec P-08):
 * the status, why, the sentence that shows it and the conversation as
 * evidence. Self-contained, so the report view only slots it in. It is not a
 * result and never counts toward the score or any pass rate. The sentences
 * come from lib/evals/reports/disclosure.ts, which the PDF and Word use too.
 */

const TONE: Record<DisclosureStatus, Tone> = { disclosed: "info", not_disclosed: "warn", unclear: "neutral" };

const ROLE: Record<DisclosureTurnKind, "user" | "assistant"> = {
  greeting: "assistant",
  opening: "user",
  first_reply: "assistant",
  person_question: "user",
  person_answer: "assistant",
};

export function AiDisclosureEvidence({ result }: { result: DisclosureResult | null | undefined }) {
  if (!result) return null;
  const tone = TONE[result.status];
  return (
    <section aria-labelledby="ai-disclosure-title" data-ai-disclosure={result.status}>
      <SectionHeading id="ai-disclosure-title" title={t("aiDisclosureTitle")}>{t("aiDisclosureNote")}</SectionHeading>
      <div className="p-evidence">
        <div className="p-verdict" data-tone={tone === "warn" ? "warn" : tone === "info" ? "info" : undefined}>
          <div className="p-verdict-head">
            <Badge tone={tone} dot>{t(AI_DISCLOSURE_STATUS_LABEL[result.status])}</Badge>
          </div>
          <p>{t(aiDisclosureReason(result))}</p>
          {result.evidence ? (
            <blockquote className="p-quote" lang={result.language}>
              {result.evidence.quote}
              <cite>{t("aiDisclosureEvidence")} · {t(AI_DISCLOSURE_TURN_LABEL[result.evidence.turn])}</cite>
            </blockquote>
          ) : null}
        </div>
        {result.transcript.length > 0 && (
          <details className="p-details">
            <summary>{t("aiDisclosureShowConversation")}</summary>
            <div className="p-transcript">
              {result.transcript.map((turn, index) => (
                <div key={`${turn.kind}-${index}`} className="p-bubble" data-role={ROLE[turn.kind]} data-turn={turn.kind}>
                  <span className="p-bubble-role">{t(AI_DISCLOSURE_TURN_LABEL[turn.kind])}</span>
                  <p lang={result.language}>{turn.error || !turn.text ? <span className="p-cell-meta">{t("aiDisclosureNotCaptured")}</span> : turn.text}</p>
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="p-field-hint">{t("aiDisclosureContext")}</p>
      </div>
    </section>
  );
}
