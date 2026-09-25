"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { Action, DataTable, RowTitle, Status, StatusBadge } from "./primitives";
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
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    try { setData(await evalRequest<Data>(`/targets/${targetId}/login-sessions?orgId=${encodeURIComponent(orgId)}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("error")); }
  }, [orgId, targetId]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function upload(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setNotice("");
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(state); } catch { throw new Error(t("loginSessionInvalidJson")); }
      await evalRequest(`/targets/${targetId}/login-sessions`, "POST", { orgId, storageState: parsed, expiresInHours: hours }, crypto.randomUUID());
      setState(""); setNotice(t("loginSessionSaved")); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("error")); }
    finally { setState(""); setPending(false); }
  }
  async function revoke(id: string) {
    setPending(true);
    try { await evalRequest(`/targets/${targetId}/login-sessions/${id}?orgId=${encodeURIComponent(orgId)}`, "DELETE"); setNotice(t("loginSessionRevoked")); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("error")); }
    finally { setPending(false); }
  }
  return (
    <section className="eval-panel" aria-label={t("websiteLoginSession")}>
      <h2>{t("websiteLoginSession")}</h2>
      <p>{t("websiteLoginSessionHelp")}</p>
      {error && <Status error>{error}</Status>}
      {notice && <Status>{notice}</Status>}
      {data?.sessions.length ? <DataTable caption={t("websiteLoginSession")} headers={[t("createdAt"), t("expires"), t("statusLabel"), { label: t("access"), align: "end" }]}>
        {data.sessions.map((session) => <tr key={session.id}>
          <RowTitle>{new Date(session.created_at).toLocaleString()}</RowTitle>
          <td className="p-cell-meta">{new Date(session.expires_at).toLocaleString()}</td>
          <td><StatusBadge value={session.state} /></td>
          <td className="p-table-action">{session.state === "active" && <Action size="sm" variant="secondary" disabled={pending} onClick={() => void revoke(session.id)}>{t("credentialRevoke")}</Action>}</td>
        </tr>)}
      </DataTable> : null}
      <form className="p-stack" onSubmit={upload} autoComplete="off">
        <label className="eval-field"><span>{t("loginSessionState")}</span>
          <textarea rows={4} value={state} onChange={(event) => setState(event.target.value)} spellCheck={false} placeholder='{"cookies":[…],"origins":[…]}' required /></label>
        <label className="eval-field"><span>{t("loginSessionExpiry")}</span>
          <select value={hours} onChange={(event) => setHours(Number(event.target.value))}>
            {[1, 24, 72, 168].map((value) => <option key={value} value={value}>{value === 1 ? "1 hour" : value === 168 ? "7 days" : `${value} hours`}</option>)}
          </select></label>
        <Button className="justify-self-start" disabled={!state || pending}>{t("saveLoginSession")}</Button>
      </form>
      {data?.captures.length ? <>
        <h3>{t("discoveryEvidence")}</h3>
        <p className="p-cell-meta">{t("discoveryEvidenceHelp")}</p>
        <ul>{data.captures.map((capture) => <li key={capture.id}><a className="p-link" href={`/api/evals/v1/browser-captures/${capture.id}?orgId=${encodeURIComponent(orgId)}`} target="_blank" rel="noreferrer">{capture.reason_code.replaceAll("_", " ")} · {new Date(capture.created_at).toLocaleString()}</a></li>)}</ul>
      </> : null}
    </section>
  );
}
