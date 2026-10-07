"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Cpu, RotateCcw } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, Status } from "./primitives";
import { RouteDialog, type Connection, type Role, type Route } from "./engine-settings";
import { t } from "@/lib/evals/messages/en";

type Settings={roles:Role[];connections:Connection[];evaluation:Route[];workspace:Route[];platform:Route[]};
const titles:Record<Role,()=>string>={context_analyzer:()=>t("roleContextAnalyzer"),generator:()=>t("roleGenerator"),judge:()=>t("roleJudge"),report_writer:()=>t("roleReportWriter")};
/** Keyed by workspace and evaluation at the call site; stale reads cannot cross either. */
export function EvaluationModels({orgId,evaluationId}:{orgId:string;evaluationId:string}) {
  const [settings,setSettings]=useState<Settings|null>(null);
  const [editing,setEditing]=useState<Role|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [pending,setPending]=useState(false);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    let live=true;
    void evalRequest<Settings>(`/evaluations/${evaluationId}/models?orgId=${encodeURIComponent(orgId)}`)
      .then(value=>{if(live){setSettings(value);setError(null);}})
      .catch(reason=>{if(live)setError(reason instanceof Error?reason.message:t("error"));});
    return()=>{live=false;};
  },[orgId,evaluationId,version]);
  const own=(role:Role)=>settings?.evaluation.find(item=>item.role===role)??null;
  const effective=(role:Role)=>own(role)??settings?.workspace.find(item=>item.role===role && item.usable)??settings?.platform.find(item=>item.role===role && item.usable)??null;
  async function reset(role:Role|"all") {
    setPending(true);setError(null);
    try {
      await evalRequest(`/evaluations/${evaluationId}/models?orgId=${encodeURIComponent(orgId)}&role=${role}`,"DELETE");
      setVersion(value=>value+1);
    } catch(reason){setError(reason instanceof Error?reason.message:t("error"));}
    finally{setPending(false);}
  }
  return <details className="p-evaluation-models">
    <summary><Cpu aria-hidden="true"/><strong>{t("evaluationModels")}</strong><span className="p-cell-meta">{settings?.evaluation.length?t("evaluationModelsCustom"):t("evaluationModelsDefault")}</span><ChevronDown aria-hidden="true"/></summary>
    <div className="p-stack">
      <p className="p-field-hint">{t("evaluationModelsHelp")}</p>
      {error && <Status error action={<Action size="sm" variant="secondary" onClick={()=>setVersion(value=>value+1)}>{t("retry")}</Action>}>{error}</Status>}
      {!settings && !error ? <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true"/>{t("loading")}</p> : settings ? <>
        <ul className="p-model-task-list" aria-label={t("evaluationModels")}>
          {settings.roles.map(role=>{const route=effective(role);return <li key={role}>
            <strong>{titles[role]()}</strong>
            <div className="p-model-task-value">{route?<><span className="p-cell-wrap">{route.model_id}</span><span className="p-cell-meta">{route.account_name} · {own(role)?t("evaluationModelsCustom"):t("evaluationModelsDefault")}</span>{!route.usable && <Badge tone="warn">{t("evaluationModelUnavailable")}</Badge>}</>:<Badge tone="warn">{t("engineNotSet")}</Badge>}</div>
            <div className="p-model-task-actions">
              {own(role) && <Action size="sm" variant="ghost" disabled={pending} onClick={()=>void reset(role)}><RotateCcw aria-hidden="true"/>{t("evaluationUseDefault")}</Action>}
              <Action size="sm" variant="secondary" disabled={pending || !settings.connections.length} onClick={()=>setEditing(role)}>{t("change")}</Action>
            </div>
          </li>;})}
        </ul>
        {!!settings.evaluation.length && <div className="p-row"><Action size="sm" variant="ghost" disabled={pending} onClick={()=>void reset("all")}><RotateCcw aria-hidden="true"/>{t("evaluationResetModels")}</Action></div>}
      </> : null}
    </div>
    {editing && settings && <RouteDialog key={editing} orgId={orgId} evaluationId={evaluationId} scope="evaluation" role={editing} workspaceName="" connections={settings.connections} current={effective(editing)} onClose={()=>setEditing(null)} onSaved={async()=>{setEditing(null);setVersion(value=>value+1);}}/>}
  </details>;
}
