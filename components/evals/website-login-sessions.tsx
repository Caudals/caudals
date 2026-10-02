"use client";

import { useCallback, useEffect, useState } from "react";
import { evalRequest } from "./api";
import { Action, SectionHeading, Status, StatusBadge, Time } from "./primitives";
import { notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";

type Data = {
  sessions: Array<{ id: string; created_at: string; expires_at: string; state: string }>;
  captures: Array<{ id: string; reason_code: string; created_at: string; expires_at: string }>;
};

/** Saved sign-ins from the live browser (no expiry on our side) and discovery evidence for one website system. */
export function WebsiteLoginSessions({ orgId, targetId }: { orgId: string; targetId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await evalRequest<Data>(`/targets/${targetId}/login-sessions?orgId=${encodeURIComponent(orgId)}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    }
  }, [orgId, targetId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function revoke(id: string) {
    setPending(true);
    try {
      await evalRequest(`/targets/${targetId}/login-sessions/${id}?orgId=${encodeURIComponent(orgId)}`, "DELETE");
      notify(t("loginSessionRevoked"));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }
  // Far-future expiry means "until revoked".
  const lasting = (value: string) => new Date(value).getTime() - Date.now() > 5 * 365 * 24 * 3600_000;
  const sessions = data?.sessions ?? [];
  if (!sessions.length && !data?.captures.length && !error) return null;
  return (
    <section aria-label={t("websiteLoginSession")}>
      <SectionHeading title={t("websiteLoginSession")}>{t("websiteLoginSessionHelp")}</SectionHeading>
      {error && <Status error>{error}</Status>}
      {sessions.length ? (
        <ul className="p-keys">
          {sessions.map((session) => (
            <li key={session.id}>
              <span className="p-keys-main">
                <span className="p-keys-name">
                  {t("savedSession")} <Time value={session.created_at} />
                </span>
                <span className="p-cell-meta">
                  {lasting(session.expires_at) ? t("untilRevoked") : <>{t("expires")} <Time value={session.expires_at} /></>}
                </span>
              </span>
              <StatusBadge value={session.state} />
              {session.state === "active" && (
                <Action size="sm" variant="ghost" disabled={pending} onClick={() => void revoke(session.id)}>
                  {t("credentialRevoke")}
                </Action>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {data?.captures.length ? (
        <>
          <SectionHeading title={t("discoveryEvidence")}>{t("discoveryEvidenceHelp")}</SectionHeading>
          <ul className="p-plain-list">
            {data.captures.map((capture) => (
              <li key={capture.id}>
                <a className="p-link" href={`/api/evals/v1/browser-captures/${capture.id}?orgId=${encodeURIComponent(orgId)}`} target="_blank" rel="noreferrer">
                  {capture.reason_code.replaceAll("_", " ")}
                </a>{" "}
                <span className="p-cell-meta">
                  <Time value={capture.created_at} />
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
