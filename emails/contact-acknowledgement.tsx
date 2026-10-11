import * as React from "react";
import type { ScopedTranslator } from "@/lib/i18n/messages";

type ContactAcknowledgementEmailProps = {
  t: ScopedTranslator<"contactEmail">;
  fullName: string;
  organization: string;
  /** Absolute URL of the booking page in the visitor's language. */
  callUrl: string;
};

// Paper palette from DESIGN.md §13: warm canvas, white sheet, ink, no accent.
const INK = "#141413";
const INK_2 = "#3b3a36";
const MUTED = "#6b6a63";
const LINE = "#dcdad3";

/**
 * Sent to the person who filled in `/contact`, in the language of the page they
 * used. It confirms receipt and the reply promise made on that page; the
 * request itself goes to the operators in `contact-inquiry.tsx`.
 */
export function ContactAcknowledgementEmail({
  t,
  fullName,
  organization,
  callUrl,
}: ContactAcknowledgementEmailProps) {
  const firstName = fullName.trim().split(/\s+/)[0] || fullName;
  const steps = [t("next1"), t("next2"), t("next3")];

  return (
    <div
      style={{
        fontFamily: "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
        backgroundColor: "#f5f4f0",
        padding: "32px 12px",
        color: INK,
      }}
    >
      <span style={{ display: "none", overflow: "hidden", maxHeight: 0, opacity: 0 }}>
        {t("preview")}
      </span>
      <table
        width="100%"
        cellPadding="0"
        cellSpacing="0"
        role="presentation"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          backgroundColor: "#ffffff",
          borderRadius: 14,
          border: `1px solid ${LINE}`,
        }}
      >
        <tbody>
          <tr>
            <td style={{ padding: "32px 32px 28px" }}>
              <p style={{ margin: "0 0 24px", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em" }}>
                Caudals
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 16, lineHeight: 1.55 }}>
                {t("greeting", { name: firstName })}
              </p>
              <p style={{ margin: "0 0 24px", fontSize: 16, lineHeight: 1.55, color: INK_2 }}>
                {t("received", { organization })}
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 500, color: MUTED }}>
                {t("nextTitle")}
              </p>
              <table width="100%" cellPadding="0" cellSpacing="0" role="presentation" style={{ marginBottom: 28 }}>
                <tbody>
                  {steps.map((step, index) => (
                    <tr key={index}>
                      <td
                        style={{
                          width: 28,
                          padding: "10px 0",
                          borderTop: `1px solid ${LINE}`,
                          fontSize: 14,
                          color: MUTED,
                          verticalAlign: "top",
                        }}
                      >
                        {index + 1}
                      </td>
                      <td
                        style={{
                          padding: "10px 0",
                          borderTop: `1px solid ${LINE}`,
                          fontSize: 15,
                          lineHeight: 1.5,
                          color: INK_2,
                        }}
                      >
                        {step}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ margin: "0 0 12px", fontSize: 15, color: INK_2 }}>{t("callLead")}</p>
              <a
                href={callUrl}
                style={{
                  display: "inline-block",
                  backgroundColor: INK,
                  color: "#ffffff",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "11px 20px",
                  borderRadius: 999,
                }}
              >
                {t("callAction")}
              </a>
              <p style={{ margin: "28px 0 4px", fontSize: 14, color: MUTED }}>{t("replyHint")}</p>
              <p style={{ margin: 0, fontSize: 15 }}>{t("signature")}</p>
            </td>
          </tr>
        </tbody>
      </table>
      <p
        style={{
          maxWidth: 560,
          margin: "16px auto 0",
          fontSize: 12,
          lineHeight: 1.5,
          color: MUTED,
          textAlign: "center",
        }}
      >
        {t("footer")}
      </p>
    </div>
  );
}
