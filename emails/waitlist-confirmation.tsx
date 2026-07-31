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
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif",
        backgroundColor: "#f9fafb",
        padding: "36px 12px",
      }}
    >
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          backgroundColor: "#ffffff",
          borderRadius: 16,
          border: "1px solid #e5e7eb",
          boxShadow: "0 4px 20px rgba(0,0,0,0.03)",
          overflow: "hidden",
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "32px 36px 16px" }}>
              <a href="https://caudals.com" style={{ textDecoration: "none", display: "inline-block" }}>
                <img
                  src="https://caudals.com/caudals-logo-wordmark.png"
                  alt="Caudals"
                  width="130"
                  style={{ display: "block", width: 130, height: "auto", border: 0 }}
                />
              </a>
            </td>
          </tr>
          <tr>
            <td style={{ padding: "0 36px" }}>
              <hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: 0 }} />
            </td>
          </tr>
          <tr>
            <td style={{ padding: "24px 36px 32px" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", color: "#059669", textTransform: "uppercase", display: "block", marginBottom: 12 }}>
                Early Access Confirmation
              </span>
              <h1 style={{ fontSize: 24, lineHeight: 1.25, color: "#111827", fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 16px" }}>
                Welcome to the Caudals waitlist, {name}!
              </h1>
              <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.62, margin: "0 0 16px" }}>
                Thanks for your interest in building production-ready datasets with Caudals. We are reviewing waitlist
                requests and will reach out shortly with next steps.
              </p>
              {company || useCase ? (
                <div
                  style={{
                    backgroundColor: "#f9fafb",
                    border: "1px solid #f3f4f6",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 20,
                    color: "#374151",
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
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
              <p style={{ fontSize: 16, color: "#4b5563", lineHeight: 1.62, margin: "0 0 24px" }}>
                In the meantime, feel free to explore live dataset requests, learn more about our contributor network, or
                reply directly to this email with any questions.
              </p>
              <p style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.6, margin: 0 }}>
                — The Caudals Team
              </p>
            </td>
          </tr>
          <tr>
            <td style={{ padding: "0 36px 32px" }}>
              <hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: "0 0 16px" }} />
              <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", margin: 0 }}>
                Caudals • Infrastructure & Managed Data for AI
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};
