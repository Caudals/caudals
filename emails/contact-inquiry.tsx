import * as React from "react";
import type { PublicEvaluationRequestRoutingResult } from "@/lib/public/evaluation-request-intake";
import {
  evaluationOwnerRoleLabels,
  evaluationRequestOfferLabels,
  evaluationSectorLabels,
  evaluationSystemStageLabels,
  evaluationSystemTypeLabels,
  type EvaluationRequestFormValues,
} from "@/lib/validators/evaluation-request";

type ContactInquiryEmailProps = EvaluationRequestFormValues & {
  submittedAt: string;
  userAgent?: string | null;
  referer?: string | null;
  evaluationRequestRouting?: PublicEvaluationRequestRoutingResult | null;
};

export function ContactInquiryEmail({
  fullName,
  workEmail,
  organization,
  organizationWebsite,
  companySize,
  systemType,
  systemStage,
  sector,
  ownerRole,
  systemAnswers,
  systemUrl,
  requestedOffer,
  message,
  submittedAt,
  userAgent,
  referer,
  evaluationRequestRouting,
}: ContactInquiryEmailProps) {
  const submitted = new Date(submittedAt);
  const formattedDate = submitted.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        backgroundColor: "#f8fafc",
        padding: "32px 0",
      }}
    >
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{
          maxWidth: 640,
          margin: "0 auto",
          backgroundColor: "#ffffff",
          borderRadius: 18,
          padding: 32,
          border: "1px solid #e2e8f0",
        }}
      >
        <tbody>
          <tr>
            <td>
              <p style={{ fontSize: 14, color: "#64748b", marginBottom: 8 }}>
                New evaluation request
              </p>
              <h1 style={{ fontSize: 24, color: "#0f172a", marginBottom: 16 }}>
                {organization} &middot; {fullName}
              </h1>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 16,
                  marginBottom: 24,
                }}
              >
                <InfoRow label="Contact" value={`${fullName} — ${workEmail}`} />
                <InfoRow label="Company" value={organization} />
                {companySize ? (
                  <InfoRow label="Company size" value={`${companySize} employees`} />
                ) : null}
                <InfoRow label="System" value={evaluationSystemTypeLabels[systemType]} />
                {systemStage ? (
                  <InfoRow label="Stage" value={evaluationSystemStageLabels[systemStage]} />
                ) : null}
                <InfoRow label="Sector" value={evaluationSectorLabels[sector]} />
                <InfoRow label="Owner" value={evaluationOwnerRoleLabels[ownerRole]} />
                {requestedOffer ? (
                  <InfoRow
                    label="Wants to start with"
                    value={evaluationRequestOfferLabels[requestedOffer]}
                  />
                ) : null}
                {systemUrl ? <InfoRow label="System URL" value={systemUrl} /> : null}
                {organizationWebsite ? (
                  <InfoRow label="Website" value={organizationWebsite} />
                ) : null}
                {evaluationRequestRouting?.status === "routed" ? (
                  <InfoRow
                    label="Operator queue"
                    value={`${evaluationRequestRouting.buyerOpportunityId} / ${evaluationRequestRouting.evaluationRequestId}`}
                  />
                ) : null}
                <InfoRow label="Submitted" value={formattedDate} />
              </div>
              <div
                style={{
                  backgroundColor: "#f8fafc",
                  borderRadius: 12,
                  padding: 20,
                  marginBottom: 20,
                  border: "1px solid #e2e8f0",
                }}
              >
                <NoteLabel>What it answers</NoteLabel>
                <NoteBody>{systemAnswers}</NoteBody>
                {message ? (
                  <>
                    <NoteLabel style={{ marginTop: 16 }}>Notes</NoteLabel>
                    <NoteBody>{message}</NoteBody>
                  </>
                ) : null}
              </div>
              {(userAgent || referer) && (
                <div
                  style={{
                    backgroundColor: "#0f172a",
                    color: "#cbd5f5",
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 13,
                    lineHeight: 1.4,
                  }}
                >
                  <p style={{ margin: "0 0 8px 0", color: "#94a3b8" }}>
                    Meta
                  </p>
                  {referer ? <p style={{ margin: 0 }}>Referrer: {referer}</p> : null}
                  {userAgent ? <p style={{ margin: 0 }}>User agent: {userAgent}</p> : null}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p
        style={{
          fontSize: 12,
          color: "#94a3b8",
          textAlign: "center",
          marginTop: 16,
        }}
      >
        Caudals • Contact inbox
      </p>
    </div>
  );
}

function NoteLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={{
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        color: "#94a3b8",
        margin: "0 0 8px 0",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function NoteBody({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 15,
        color: "#0f172a",
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        margin: 0,
      }}
    >
      {children}
    </p>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 12,
          color: "#94a3b8",
          textTransform: "uppercase",
          letterSpacing: 0.6,
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 15, color: "#0f172a" }}>{value}</span>
    </div>
  );
}
