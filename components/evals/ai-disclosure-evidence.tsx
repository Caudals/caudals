"use client";

import type { DisclosureResult, DisclosureStatus, DisclosureTurnKind } from "@/lib/evals/scoring/disclosure";
import { t, type MessageKey } from "@/lib/evals/messages/runtime";
import { Badge, SectionHeading, type Tone } from "./primitives";

/**
 * The AI-disclosure check in the product report (launch L-29, spec P-08):
 * the status, why, the sentence that shows it and the conversation as
 * evidence. Self-contained, so the report view only slots it in. It is not a
 * result and never counts toward the score or any pass rate.
 */

const STATUS: Record<DisclosureStatus, { label: MessageKey; tone: Tone }> = {
  disclosed: { label: "aiDisclosureDisclosed", tone: "info" },
  not_disclosed: { label: "aiDisclosureNotDisclosed", tone: "warn" },
  unclear: { label: "aiDisclosureUnclear", tone: "neutral" },
};

const TURN: Record<DisclosureTurnKind, MessageKey> = {
  greeting: "aiDisclosureTurnGreeting",
  opening: "aiDisclosureTurnOpening",
  first_reply: "aiDisclosureTurnFirstReply",
  person_question: "aiDisclosureTurnPersonQuestion",
  person_answer: "aiDisclosureTurnPersonAnswer",
};

const ROLE: Record<DisclosureTurnKind, "user" | "assistant"> = {
  greeting: "assistant",
  opening: "user",
  first_reply: "assistant",
  person_question: "user",
  person_answer: "assistant",
};

/** The sentence under the status, from the stored reason; copy never comes from a model. */
export function aiDisclosureReason(result: Pick<DisclosureResult, "status" | "reason">): MessageKey {
  switch (result.reason) {
    case "self_identified": return "aiDisclosureSelfIdentified";
    case "denied_being_human": return "aiDisclosureDeniedBeingHuman";
    case "claimed_human": return "aiDisclosureClaimedHuman";
    case "conflicting": return "aiDisclosureConflicting";
    case "not_captured": return "aiDisclosureNotCapturedReason";
    case "judge": return result.status === "disclosed" ? "aiDisclosureJudgeDisclosed" : result.status === "not_disclosed" ? "aiDisclosureJudgeNotDisclosed" : "aiDisclosureNoSignal";
    default: return "aiDisclosureNoSignal";
  }
}

export function AiDisclosureEvidence({ result }: { result: DisclosureResult | null | undefined }) {
  if (!result) return null;
  const status = STATUS[result.status];
  return (
    <section aria-labelledby="ai-disclosure-title" data-ai-disclosure={result.status}>
      <SectionHeading id="ai-disclosure-title" title={t("aiDisclosureTitle")}>{t("aiDisclosureNote")}</SectionHeading>
      <div className="p-evidence">
        <div className="p-verdict" data-tone={status.tone === "warn" ? "warn" : status.tone === "info" ? "info" : undefined}>
          <div className="p-verdict-head">
            <Badge tone={status.tone} dot>{t(status.label)}</Badge>
          </div>
          <p>{t(aiDisclosureReason(result))}</p>
          {result.evidence ? (
            <blockquote className="p-quote" lang={result.language}>
              {result.evidence.quote}
              <cite>{t("aiDisclosureEvidence")} · {t(TURN[result.evidence.turn])}</cite>
            </blockquote>
          ) : null}
        </div>
        {result.transcript.length > 0 && (
          <details className="p-details">
            <summary>{t("aiDisclosureShowConversation")}</summary>
            <div className="p-transcript">
              {result.transcript.map((turn, index) => (
                <div key={`${turn.kind}-${index}`} className="p-bubble" data-role={ROLE[turn.kind]} data-turn={turn.kind}>
                  <span className="p-bubble-role">{t(TURN[turn.kind])}</span>
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
