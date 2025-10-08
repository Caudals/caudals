import * as React from "react";

type WaitlistConfirmationEmailProps = {
  fullName?: string | null;
  company?: string | null;
  useCase?: string | null;
};

export const WaitlistConfirmationEmail = ({
  fullName,
  company,
  useCase,
}: WaitlistConfirmationEmailProps) => {
  const name = fullName?.trim() ? fullName : "there";

  return (
    <div
      style={{
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        backgroundColor: "#f8fafc",
        padding: "32px 0",
      }}
    >
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{ maxWidth: 560, margin: "0 auto", backgroundColor: "#ffffff", borderRadius: 16, padding: 32 }}
      >
        <tbody>
          <tr>
            <td>
              <h1 style={{ fontSize: 24, color: "#0f172a", marginBottom: 16 }}>
                Welcome to the Collective waitlist, {name}!
              </h1>
              <p style={{ fontSize: 16, color: "#334155", lineHeight: 1.6, marginBottom: 16 }}>
                Thanks for your interest in building production-ready datasets with Collective. We are reviewing waitlist
                requests and will reach out shortly with next steps.
              </p>
              {company || useCase ? (
                <div style={{
                  backgroundColor: "#f1f5f9",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 16,
                  color: "#334155",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}>
                  {company ? (
                    <p style={{ margin: "0 0 8px 0" }}>
                      <strong>Team:</strong> {company}
                    </p>
                  ) : null}
                  {useCase ? (
                    <p style={{ margin: 0 }}>
                      <strong>Primary focus:</strong> {useCase}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <p style={{ fontSize: 16, color: "#334155", lineHeight: 1.6, marginBottom: 16 }}>
                In the meantime, feel free to explore live dataset requests, learn more about our contributor network, or
                reply to this email with any questions.
              </p>
              <p style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6 }}>
                — The Collective Team
              </p>
            </td>
          </tr>
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 16 }}>
        Collective • Crowdsourcing production datasets for AI teams
      </p>
    </div>
  );
};
