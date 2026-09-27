"use client";

import { useCallback, useEffect, useState } from "react";
import { evalRequest } from "./api";
import { Action, SectionHeading, SelectField, Status, StatusBadge, TextArea, Time } from "./primitives";
import { notify } from "./overlays";
import { t } from "@/lib/evals/messages/en";

type Data = {
  sessions: Array<{ id: string; created_at: string; expires_at: string; state: string }>;
  captures: Array<{ id: string; reason_code: string; created_at: string; expires_at: string }>;
};

/** Operator-assisted login state and discovery evidence for one website system (spec §8.3). */
export function WebsiteLoginSessions({ orgId, targetId }: { orgId: string; targetId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState("");
  const [hours, setHours] = useState(24);
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
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(state);
      } catch {
        throw new Error(t("loginSessionInvalidJson"));
      }
      await evalRequest(`/targets/${targetId}/login-sessions`, "POST", { orgId, storageState: parsed, expiresInHours: hours }, crypto.randomUUID());
      notify(t("loginSessionSaved"));
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setState("");
      setPending(false);
    }
  }
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
  return (
    <section aria-label={t("websiteLoginSession")}>
      <SectionHeading title={t("websiteLoginSession")}>{t("websiteLoginSessionHelp")}</SectionHeading>
      {error && <Status error>{error}</Status>}
      {data?.sessions.length ? (
        <ul className="p-keys">
          {data.sessions.map((session) => (
            <li key={session.id}>
              <span className="p-keys-main">
                <span className="p-keys-name">
                  {t("savedSession")} <Time value={session.created_at} />
                </span>
                <span className="p-cell-meta">
                  {t("expires")} <Time value={session.expires_at} />
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
      <form className="p-inline-form" onSubmit={upload} autoComplete="off">
        <TextArea id={`login-state-${targetId}`} label={t("loginSessionState")} rows={4} value={state} onChange={(event) => setState(event.target.value)} spellCheck={false} placeholder='{"cookies":[…],"origins":[…]}' required />
        <SelectField id={`login-expiry-${targetId}`} label={t("loginSessionExpiry")} value={hours} onChange={(event) => setHours(Number(event.target.value))}>
          {[1, 24, 72, 168].map((value) => (
            <option key={value} value={value}>
              {value === 1 ? "1 hour" : value === 168 ? "7 days" : `${value} hours`}
            </option>
          ))}
        </SelectField>
        <div className="p-row">
          <Action type="submit" variant="secondary" disabled={!state || pending}>
            {t("saveLoginSession")}
          </Action>
        </div>
      </form>
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
