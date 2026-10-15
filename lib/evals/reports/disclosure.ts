import type { MessageKey } from "../messages/en";
import type { DisclosureResult, DisclosureStatus, DisclosureTurnKind } from "../scoring/disclosure";

/**
 * The AI-disclosure check (launch L-29) in every report format: the web
 * report, the share page, the PDF and the Word file (gap G3). One mapping from
 * the stored result to the app catalogue's sentences, so every format says the
 * same thing: evidence for the owner's own assessment, never a legal
 * determination, never "compliant" or "certified". Copy never comes from a
 * model. Plain module (no "use client"), so server renderers and the workers
 * can call it.
 */

export const AI_DISCLOSURE_STATUS_LABEL: Record<DisclosureStatus, MessageKey> = {
  disclosed: "aiDisclosureDisclosed",
  not_disclosed: "aiDisclosureNotDisclosed",
  unclear: "aiDisclosureUnclear",
};

export const AI_DISCLOSURE_TURN_LABEL: Record<DisclosureTurnKind, MessageKey> = {
  greeting: "aiDisclosureTurnGreeting",
  opening: "aiDisclosureTurnOpening",
  first_reply: "aiDisclosureTurnFirstReply",
  person_question: "aiDisclosureTurnPersonQuestion",
  person_answer: "aiDisclosureTurnPersonAnswer",
};

/** The sentence under the status, from the stored reason. */
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

/**
 * The check in a shared copy. Its status and reason travel with the findings;
 * the quoted sentence and the conversation are interaction excerpts, so they
 * travel only with the individual results. Nothing without the findings.
 */
export function sharedDisclosure(result: DisclosureResult | null | undefined, permitted: Iterable<string>): DisclosureResult | undefined {
  if (!result) return undefined;
  const fields = new Set(permitted);
  if (!fields.has("findings")) return undefined;
  return fields.has("results") ? result : { ...result, evidence: null, transcript: [] };
}

/**
 * Stored PDF and Word files that carry the check end in `.ai` before the
 * extension (`reports/<revision>.v3.ai.pdf`), so switching AI_DISCLOSURE_CHECK
 * renders a fresh copy instead of serving one made under the other setting.
 */
export const DISCLOSURE_FILE_MARKER = ".ai";
export function disclosureFileMarker(report: { ai_disclosure?: unknown }): string {
  return report.ai_disclosure ? DISCLOSURE_FILE_MARKER : "";
}
