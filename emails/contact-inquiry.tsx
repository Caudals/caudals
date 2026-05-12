import * as React from "react";
import type { PublicBuyerBriefRoutingResult } from "@/lib/public/buyer-brief-intake";
import type { CollaborationFormValues } from "@/lib/validators/collaboration";

const focusAreaLabels: Record<CollaborationFormValues["focusArea"], string> = {
  "sell-data": "Wants to sell company data",
  "buy-dataset": "Wants to acquire a pre-made dataset",
  "custom-dataset": "Needs a custom dataset built",
  "ai-consulting": "AI consulting & model training",
};

const industryLabels: Record<string, string> = {
  logistics: "Logistics & Transportation",
  retail: "Retail & E-commerce",
  healthcare: "Healthcare & Life Sciences",
  agriculture: "Agriculture & Agritech",
  fintech: "Fintech & Banking",
  energy: "Energy & Utilities",
  manufacturing: "Manufacturing & IoT",
  "real-estate": "Real Estate & PropTech",
  telecom: "Telecom & Networks",
  insurance: "Insurance",
  other: "Other",
};

type ContactInquiryEmailProps = CollaborationFormValues & {
  submittedAt: string;
  userAgent?: string | null;
  referer?: string | null;
  buyerBriefRouting?: PublicBuyerBriefRoutingResult | null;
};

export function ContactInquiryEmail({
  fullName,
  workEmail,
  organization,
  organizationWebsite,
  message,
  focusArea,
  industry,
  teamSize,
  datasetModality,
  geography,
  freshness,
  volume,
  budgetRange,
  timeline,
  targetFormats,
  sensitivityConstraints,
  submittedAt,
  userAgent,
  referer,
  buyerBriefRouting,
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
                New contact inquiry
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
                <InfoRow label="Interest" value={focusAreaLabels[focusArea]} />
                {industry ? <InfoRow label="Industry" value={industryLabels[industry] ?? industry} /> : null}
                {teamSize ? <InfoRow label="Company size" value={teamSize} /> : null}
                {datasetModality ? (
                  <InfoRow label="Dataset type" value={datasetModality} />
                ) : null}
                {budgetRange ? <InfoRow label="Budget" value={budgetRange} /> : null}
                {timeline ? <InfoRow label="Timeline" value={timeline} /> : null}
                {geography ? <InfoRow label="Geography" value={geography} /> : null}
                {freshness ? <InfoRow label="Freshness" value={freshness} /> : null}
                {volume ? <InfoRow label="Volume" value={volume} /> : null}
                {targetFormats ? (
                  <InfoRow label="Target formats" value={targetFormats} />
                ) : null}
                {buyerBriefRouting?.status === "routed" ? (
                  <InfoRow
                    label="Operator queue"
                    value={`${buyerBriefRouting.buyerOpportunityId} / ${buyerBriefRouting.datasetBriefId}`}
                  />
                ) : null}
                {organizationWebsite ? (
                  <InfoRow label="Website" value={organizationWebsite} />
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
                <p
                  style={{
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    color: "#94a3b8",
                    marginBottom: 8,
                  }}
                >
                  Inquiry notes
                </p>
                <p
                  style={{
                    fontSize: 15,
                    color: "#0f172a",
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {message}
                </p>
                {sensitivityConstraints ? (
                  <p
                    style={{
                      fontSize: 13,
                      color: "#475569",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      margin: "16px 0 0 0",
                    }}
                  >
                    Sensitivity notes: {sensitivityConstraints}
                  </p>
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
