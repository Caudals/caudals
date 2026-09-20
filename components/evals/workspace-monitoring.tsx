"use client";

import { useCallback,useEffect,useMemo,useState } from "react";
import { Button } from "@/components/ui/button";
import { evalRequest } from "./api";
import { DataTable,Field,Status } from "./primitives";
import type { WorkspaceSummary } from "./workspace-evaluations";

type Schedule={id:string;evaluation_id:string;target_revision_id:string;suite_version_id:string;timezone:string;
  cadence:string;local_time:string;max_run_spend:string;source_max_age_days:number|null;status:string;
  next_due_at:string;version:number;latest_dispatch_status:string|null;latest_dispatch_reason:string|null;latest_alert_status:string|null};
type Alert={id:string;schedule_id:string;candidate_run_id:string;status:string;reason_codes:string[];created_at:string};
type Endpoint={id:string;label:string;url:string;events:string[];enabled:boolean;failed_deliveries:number};
type Token={id:string;name:string;scopes:string[];expires_at:string;revoked_at:string|null};
const isoDate=(value:string)=>new Date(value).toLocaleString();
export function WorkspaceMonitoringPanel({orgId,canManage,summary}:{orgId:string;canManage:boolean;summary:WorkspaceSummary}){
  const [schedules,setSchedules]=useState<Schedule[]>([]),[alerts,setAlerts]=useState<Alert[]>([]),
    [endpoints,setEndpoints]=useState<Endpoint[]>([]),[tokens,setTokens]=useState<Token[]>([]),
    [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),
    [newSecret,setNewSecret]=useState("");
  const [evaluationId,setEvaluationId]=useState(""),[targetRevisionId,setTargetRevisionId]=useState(""),
    [cadence,setCadence]=useState<"daily"|"weekly"|"monthly">("daily"),
    [localTime,setLocalTime]=useState("09:00"),[timezone,setTimezone]=useState(Intl.DateTimeFormat().resolvedOptions().timeZone||"UTC"),
    [weekday,setWeekday]=useState(1),[dayOfMonth,setDayOfMonth]=useState(1),[maxRunSpend,setMaxRunSpend]=useState(""),
    [sourceMaxAgeDays,setSourceMaxAgeDays]=useState("");
  const eligible=summary.evaluations.filter(item=>item.preparation_status==="ready"&&item.selected_suite_version_id);
  const evaluation=eligible.find(item=>item.id===evaluationId)??eligible[0];
  const systems=summary.systems.filter(item=>item.project_id===evaluation?.project_id&&item.document.kind!=="imported_responses");
  const selectedTarget=systems.find(item=>item.target_revision_id===targetRevisionId)??systems[0];
  const refresh=useCallback(async()=>{
    if(!orgId)return;
    const [s,a,e,t]=await Promise.all([
      evalRequest<Schedule[]>(`/schedules?orgId=${encodeURIComponent(orgId)}`),
      evalRequest<Alert[]>(`/alerts?orgId=${encodeURIComponent(orgId)}`),
      evalRequest<Endpoint[]>(`/webhooks?orgId=${encodeURIComponent(orgId)}`),
      evalRequest<Token[]>(`/tokens?orgId=${encodeURIComponent(orgId)}`)]);
    setSchedules(s);setAlerts(a);setEndpoints(e);setTokens(t);
  },[orgId]);
  useEffect(()=>{const timer=window.setTimeout(()=>{void refresh().catch(value=>setError(value instanceof Error?value.message:"Could not load monitoring."));},0);
    return()=>window.clearTimeout(timer);},[refresh]);
  const chosenSpend=maxRunSpend||evaluation?.commercial_cap||"";
  const canCreate=summary.entitlement.can_schedule&&!!evaluation&&!!selectedTarget;
  async function mutate(action:()=>Promise<unknown>,success:string){setBusy(true);setError("");setMessage("");
    try{await action();await refresh();setMessage(success);}catch(value){setError(value instanceof Error?value.message:"The change could not be saved.");}
    finally{setBusy(false);}}
  async function createSchedule(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!evaluation||!selectedTarget)return;
    await mutate(()=>evalRequest("/schedules","POST",{orgId,evaluationId:evaluation.id,targetRevisionId:selectedTarget.target_revision_id,
      suiteVersionId:evaluation.selected_suite_version_id,timezone,cadence,localTime,
      weekday:cadence==="weekly"?weekday:null,dayOfMonth:cadence==="monthly"?dayOfMonth:null,
      maxRunSpend:chosenSpend,currency:evaluation.currency,
      sourceMaxAgeDays:sourceMaxAgeDays?Number(sourceMaxAgeDays):null},crypto.randomUUID()),"Schedule created.");
  }
  async function createToken(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);
    setBusy(true);setError("");setMessage("");try{
      const result=await evalRequest<{token:string}>("/tokens","POST",{orgId,name:String(data.get("name")),
        scopes:[String(data.get("scope"))],expiresAt:new Date(Date.now()+Number(data.get("days"))*86400_000).toISOString()});
      setNewSecret(result.token);await refresh();setMessage("Copy this token now. It will not be shown again.");
    }catch(value){setError(value instanceof Error?value.message:"Token creation failed.");}finally{setBusy(false);}}
  async function createEndpoint(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);
    setBusy(true);setError("");setMessage("");try{
      const result=await evalRequest<{secret:string}>("/webhooks","POST",{orgId,label:String(data.get("label")),
        url:String(data.get("url")),events:["run_completed","run_partial","run_unknown","regression","inconclusive"]});
      setNewSecret(result.secret);await refresh();setMessage("Copy this webhook signing secret now. It will not be shown again.");
    }catch(value){setError(value instanceof Error?value.message:"Webhook creation failed.");}finally{setBusy(false);}}
  const current=useMemo(()=>new Map(summary.evaluations.map(item=>[item.id,item])),[summary.evaluations]);
  return <section className="eval-monitoring" aria-labelledby="monitoring-title">
    <header className="eval-heading"><h2 id="monitoring-title">Scheduled monitoring</h2><p>Repeat an approved test set at a local time. The suite stays pinned until you explicitly update it. Missed periods catch up once at the latest slot.</p></header>
    {error&&<Status error>{error}</Status>}{message&&<Status>{message}</Status>}
    {!summary.entitlement.can_schedule&&<Status>Scheduled runs are not enabled in this workspace. Existing schedules and delivery history remain visible.</Status>}
    {canManage&&canCreate&&<form className="eval-panel eval-monitor-form" onSubmit={createSchedule}>
      <h3>New schedule</h3><div className="eval-monitor-fields">
      <label>Evaluation<select value={evaluation?.id??""} onChange={event=>{setEvaluationId(event.target.value);setTargetRevisionId("");setMaxRunSpend("");}}>{eligible.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>System<select value={selectedTarget?.target_revision_id??""} onChange={event=>setTargetRevisionId(event.target.value)}>{systems.map(item=><option key={item.target_revision_id} value={item.target_revision_id}>{item.title}</option>)}</select></label>
      <label>Cadence<select value={cadence} onChange={event=>setCadence(event.target.value as typeof cadence)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
      {cadence==="weekly"&&<label>Weekday<select value={weekday} onChange={event=>setWeekday(Number(event.target.value))}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,index)=><option key={day} value={index+1}>{day}</option>)}</select></label>}
      {cadence==="monthly"&&<Field id="monitor-day" label="Day of month (1–31)" type="number" min={1} max={31} value={dayOfMonth} onChange={event=>setDayOfMonth(Number(event.target.value))} required />}
      <Field id="monitor-time" label="Local time" type="time" value={localTime} onChange={event=>setLocalTime(event.target.value)} required />
      <Field id="monitor-zone" label="IANA timezone" value={timezone} onChange={event=>setTimezone(event.target.value)} required />
      <Field id="monitor-spend" label={`Maximum run spend (${evaluation?.currency??summary.entitlement.currency})`} inputMode="decimal" value={chosenSpend} onChange={event=>setMaxRunSpend(event.target.value)} required />
      <Field id="monitor-freshness" label="Maximum source age in days (optional)" type="number" min={1} max={3650} value={sourceMaxAgeDays} onChange={event=>setSourceMaxAgeDays(event.target.value)} />
      </div><p>The local slot runs once. A nonexistent daylight-saving time is skipped; a repeated time uses its first occurrence. Monthly dates absent in a shorter month are skipped.</p><Button disabled={busy}>Create schedule</Button>
    </form>}
    {schedules.length?<DataTable caption="Monitoring schedules" headers={["Evaluation","Timing","Pinned suite","Next run","Status","Action"]}>{schedules.map(item=>{
      const approved=current.get(item.evaluation_id)?.selected_suite_version_id;
      return <tr key={item.id}><th scope="row">{current.get(item.evaluation_id)?.title??item.evaluation_id}</th><td>{item.cadence} at {String(item.local_time).slice(0,5)} {item.timezone}</td><td><code>{item.suite_version_id.slice(0,8)}</code>{approved&&approved!==item.suite_version_id?<small className="eval-cell-meta">Approved suite changed</small>:null}</td><td>{isoDate(item.next_due_at)}</td><td>{item.status}{item.latest_dispatch_reason?` · ${item.latest_dispatch_reason}`:item.latest_alert_status?` · ${item.latest_alert_status}`:""}</td><td className="eval-monitor-actions">{canManage&&<Button variant="outline" disabled={busy} onClick={()=>void mutate(()=>evalRequest(`/schedules/${item.id}`,"PATCH",{orgId,expectedVersion:item.version,status:item.status==="active"?"paused":"active"}),"Schedule updated.")}>{item.status==="active"?"Pause":"Resume"}</Button>}{canManage&&approved&&approved!==item.suite_version_id&&<Button variant="outline" disabled={busy} onClick={()=>void mutate(()=>evalRequest(`/schedules/${item.id}`,"PATCH",{orgId,expectedVersion:item.version,suiteVersionId:approved}),"The schedule now uses the approved suite.")}>Use approved suite</Button>}</td></tr>;})}</DataTable>:<p>No monitoring schedules yet.</p>}
    <section className="eval-panel"><h3>Monitoring outcomes</h3>{alerts.length?<DataTable caption="Monitoring outcomes" headers={["When","Outcome","Reason","Run"]}>{alerts.map(item=><tr key={item.id}><th scope="row">{isoDate(item.created_at)}</th><td>{item.status}</td><td>{item.reason_codes.join(", ")||"—"}</td><td><code>{item.candidate_run_id.slice(0,8)}</code></td></tr>)}</DataTable>:<p>No completed scheduled runs yet.</p>}</section>
    <div className="eval-settings-grid"><section className="eval-panel"><h3>Customer API tokens</h3><p>Read-only tokens expire and can be revoked here. Store the value in your CI secret manager.</p>{canManage&&<form onSubmit={createToken} className="eval-check-list"><Field id="monitor-token-name" label="Name" name="name" required maxLength={120}/><label>Scope<select name="scope"><option value="runs:read">Runs</option><option value="reports:read">Published reports</option><option value="schedules:read">Schedules</option></select></label><label>Expires in<select name="days"><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></label><Button disabled={busy}>Create token</Button></form>}{tokens.length?<ul className="eval-monitor-list">{tokens.map(item=><li key={item.id}><strong>{item.name}</strong> · {item.scopes.join(", ")} · expires {isoDate(item.expires_at)} {item.revoked_at?"· revoked":canManage&&<Button variant="outline" disabled={busy} onClick={()=>void mutate(()=>evalRequest(`/tokens/${item.id}`,"DELETE",{orgId}),"Token revoked.")}>Revoke</Button>}</li>)}</ul>:<p>No tokens.</p>}</section>
      <section className="eval-panel"><h3>Webhooks</h3><p>Events contain IDs and outcome status. Each delivery is signed and retries independently of the run.</p>{canManage&&<form onSubmit={createEndpoint} className="eval-check-list"><Field id="monitor-webhook-name" label="Name" name="label" required maxLength={120}/><Field id="monitor-webhook-url" label="HTTPS URL" type="url" name="url" required /><Button disabled={busy}>Add webhook</Button></form>}{endpoints.length?<ul className="eval-monitor-list">{endpoints.map(item=><li key={item.id}><strong>{item.label}</strong> · {item.url} · {item.enabled?"enabled":"disabled"} {item.failed_deliveries?`· ${item.failed_deliveries} failed`:""} {canManage&&<><Button variant="outline" disabled={busy} onClick={()=>void mutate(()=>evalRequest(`/webhooks/${item.id}`,"PATCH",{orgId,enabled:!item.enabled}),"Webhook updated.")}>{item.enabled?"Disable":"Enable"}</Button><Button variant="outline" disabled={busy} onClick={()=>{setBusy(true);setError("");void evalRequest<{secret:string}>(`/webhooks/${item.id}`,"PATCH",{orgId,rotate:true}).then(async result=>{setNewSecret(result.secret);await refresh();setMessage("Copy the new signing secret now.");}).catch(value=>setError(value instanceof Error?value.message:"Rotation failed.")).finally(()=>setBusy(false));}}>Rotate secret</Button></>}</li>)}</ul>:<p>No webhooks.</p>}</section></div>
    {newSecret&&<section className="eval-panel" aria-live="polite"><h3>New secret</h3><p>Copy this value now; it will not appear in the list.</p><code className="eval-monitor-secret">{newSecret}</code><Button variant="outline" onClick={()=>setNewSecret("")}>Hide value</Button></section>}
  </section>;
}
