import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, DownloadIcon, SearchIcon, RefreshCwIcon, SparklesIcon, PhoneIcon, Building2Icon, UsersIcon, KeyRoundIcon, HistoryIcon } from "lucide-react";
import Request from "@/lib/api/client/Request";
import { Page, PageTopbar, PageBody, SectionBar, StatStrip, Stat, EmptyBlock } from "@/components/layout/Page";
import { TextInput, NumberInput, Label } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";

type Json = Record<string, unknown>;
type Account = { id: string; name: string; enabled: boolean; status: string; priority: number; api_mode?: string; reserve: number; daily_budget: number; spent: number; spent_day: string; checked_at?: number; cooldown_until: number; balances?: Record<string, { limit: number; consumed: number; left_over: number }> | null };
type Person = { id: string; name: string; first_name: string; last_name: string; title: string; email: string; email_status: string; phone: string; company: string; domain: string; linkedin_url: string; location: string; account_name: string };
type Company = { id: string; name: string; primary_domain?: string; industry?: string; estimated_num_employees?: number; country?: string; phone?: string; account_name?: string };
type Search = { id: string; name: string; kind: "people" | "companies"; params: Json };
type Job = { id: string; status: string; request_id: string; operation: string; next_poll_at: number; error_code?: string };
type History = { id: string; action: string; at: number; result: Json };
type State = { accounts: Account[]; settings: { strategy: string; retention_days: number }; workspace: string };
type Reply = { people: Person[]; companies: Company[]; data: Json; account_name: string; reserved_credits: number; cached?: boolean; job?: Job };
type Review = { title: string; description: string; action: () => Promise<void> };
const button = "h-8 px-3 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center justify-center gap-1.5";
const primary = button + " !bg-slate-900 !text-white !border-slate-900 hover:!bg-slate-800";
const csv = (value: string) => '"' + (/^[=+@\-\t\r]/.test(value) ? "'" : "") + value.replace(/"/g, '""') + '"';
const api = <T,>(path: string, method = "GET", data?: unknown) => Request<T>({ url: "/rocketreach" + path, method, data, authorization: true, timeout: 180000 });
const split = (value: string) => value.split(",").map(v => v.trim()).filter(Boolean);
const uid = () => crypto.randomUUID();
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String((error as { message?: string })?.message || "La operación no se pudo completar."); }

export default function RocketReachPanel({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState("search");
  const [people, setPeople] = useState<Person[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [searches, setSearches] = useState<Search[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [searchKind, setSearchKind] = useState<"people" | "companies">("people");
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState("");
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [employees, setEmployees] = useState("");
  const [query, setQuery] = useState("");
  const [advanced, setAdvanced] = useState("{}");
  const [accountID, setAccountID] = useState("");
  const [results, setResults] = useState<(Person | Company)[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [accountName, setAccountName] = useState("");
  const [key, setKey] = useState("");
  const [dailyBudget, setDailyBudget] = useState(100);
  const [reserve, setReserve] = useState(0);
  const [priority, setPriority] = useState(100);
  const [subscribe, setSubscribe] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [revealPersonal, setRevealPersonal] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [apiMode, setApiMode] = useState("legacy");
  const [fieldMap, setFieldMap] = useState("{}");
  const [targetQuery, setTargetQuery] = useState("");

  const refresh = useCallback(async () => {
    const [status, persons, orgs, saved, activity, pending] = await Promise.all([
      api<State>("/status"), api<{ data: Person[] }>("/results"), api<{ data: Company[] }>("/companies"),
      api<{ data: Search[] }>("/saved-searches"), api<{ data: History[] }>("/history"), api<{ data: Job[] }>("/jobs"),
    ]);
    setState(status); setPeople(persons.data); setCompanies(orgs.data); setSearches(saved.data); setHistory(activity.data); setJobs(pending.data);
  }, []);
  useEffect(() => { refresh().catch(e => setError(errorMessage(e))); }, [refresh]);
  useEffect(() => {
    if (!jobs.some(j => j.status === "pending")) return;
    const timer = window.setInterval(() => { refresh().catch(() => {}); }, 30000);
    return () => window.clearInterval(timer);
  }, [jobs, refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); await refresh(); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  function buildParams(searchPage = page): Json {
    const extra: unknown = JSON.parse(advanced);
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("Los filtros avanzados deben ser un objeto JSON.");
    const params: Json = { ...extra, start: (searchPage - 1) * 50 + 1, page_size: 50 };
    const queryFilters: Json = { ...((extra as Json).query as Json || {}) };
    if (domain.trim()) queryFilters[searchKind === "people" ? "company_domain" : "domain"] = split(domain);
    if (titles.trim() && searchKind === "people") queryFilters.current_title = split(titles);
    if (locations.trim()) queryFilters.geo = split(locations);
    if (employees.trim()) queryFilters[searchKind === "people" ? "company_size" : "employees"] = employees.split(";").map(v => v.trim());
    if (query.trim()) queryFilters.keyword = searchKind === "people" ? query.trim() : split(query);
    params.query = queryFilters;
    return params;
  }
  async function searchAt(searchPage: number) {
    const response = await api<Reply>("/execute", "POST", { operation: searchKind + ".search", params: buildParams(searchPage), account_id: accountID || undefined, spend: true, idempotency_key: uid() });
    setPage(searchPage); setResults(searchKind === "people" ? response.people : response.companies); setSelected(new Set());
    setNotice(`${(searchKind === "people" ? response.people : response.companies).length} resultados · ${response.account_name}${response.reserved_credits ? ` · ${response.reserved_credits} crédito reservado` : " · sin consumo de créditos"}`);
  }
  function searchRequest(searchPage = 1) {
    setReview({ title: searchKind === "companies" ? "Buscar empresas" : "Buscar personas", description: `Reserva conservadora: ${searchKind === "companies" ? 2 : 1} créditos por página. Universal Credits cobra por buscar; el consumo en cuentas clásicas depende del plan.`, action: () => searchAt(searchPage) });
  }
  const visible = useMemo(() => {
    const source = tab === "people" ? people : tab === "companies" ? companies : results;
    const q = filter.toLowerCase().trim();
    return q ? source.filter(p => JSON.stringify(p).toLowerCase().includes(q)) : source;
  }, [tab, people, companies, results, filter]);
  const companyView = tab === "companies" || tab === "search" && searchKind === "companies";
  const selectedRows = visible.filter(p => selected.has(p.id));
  function toggle(id: string) { setSelected(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else if (next.size < 100) next.add(id); return next; }); }
  function selectTab(next: string) { setTab(next); setSelected(new Set()); setFilter(""); }
  function enrich(phone = false) {
    if (!selectedRows.length) return;
    const maximum = selectedRows.length * (companyView ? 1 : 2 + (phone ? 6 : 0) + (revealPersonal ? 3 : 0) + (detailed ? 1 : 0));
    setReview({ title: phone ? "Obtener emails y teléfonos" : "Enriquecer selección", description: `${selectedRows.length} registros, en lotes reanudables de 10. Reserva máxima: ${maximum} créditos. Las respuestas guardadas se reutilizan durante 14 días. Los teléfonos pueden tardar unos minutos.`, action: async () => {
      let count = 0;
      for (let i = 0; i < selectedRows.length; i += 10) {
        const details = selectedRows.slice(i, i + 10).map(p => companyView ? { domain: (p as Company).primary_domain, name: p.name } : { id: p.id });
        const response = await api<Reply>("/execute", "POST", { operation: companyView ? "companies.bulk-enrich" : "people.bulk-enrich", params: { details }, options: companyView ? {} : { reveal_phone: phone, reveal_professional_email: true, reveal_personal_email: revealPersonal, reveal_detailed_person_enrichment: detailed }, account_id: accountID || undefined, spend: true, idempotency_key: uid() });
        count += companyView ? response.companies.length : response.people.length;
      }
      setNotice(`${count} registros enriquecidos. Revisa Personas o Empresas guardadas.`);
      setSelected(new Set()); selectTab(companyView ? "companies" : "people");
    } });
  }
  function importSelection() {
    setReview({ title: "Importar a Warmbly", description: `${selectedRows.length} personas seleccionadas. ${verifiedOnly ? "Solo emails verificados." : "Se incluyen emails sin verificar."} Los contactos existentes conservan su suscripción y sus bajas. Esta acción no activa ninguna campaña.`, action: async () => {
      const response = await api<{ summary: { created: number; updated: number; skipped: number } }>("/import", "POST", { ids: selectedRows.map(p => p.id), subscribe_new: subscribe, verified_only: verifiedOnly, update_existing: updateExisting, field_map: JSON.parse(fieldMap), idempotency_key: uid() });
      setNotice(`${response.summary.created} creados · ${response.summary.updated} actualizados · ${response.summary.skipped} omitidos`); setSelected(new Set());
    } });
  }
  function exportCSV() {
    const rows = selectedRows.length ? selectedRows : visible;
    const fields = companyView ? ["name", "primary_domain", "industry", "estimated_num_employees", "country", "phone"] : ["first_name", "last_name", "email", "email_status", "phone", "title", "company", "domain", "linkedin_url", "location"];
    const value = [fields.join(","), ...rows.map(row => fields.map(f => csv(String((row as unknown as Json)[f] ?? ""))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + value], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "rocketreach-" + (companyView ? "companies" : "people") + ".csv"; link.click(); URL.revokeObjectURL(url);
  }
  const pending = jobs.filter(j => j.status === "pending");
  const knownCredits = state?.accounts.reduce((total, a) => total + (a.enabled ? a.balances?.lead_credit?.left_over || 0 : 0), 0) || 0;
  return <Page>
    <PageTopbar eyebrow="RocketReach" subtitle="Prospección, enriquecimiento e importación directa a Warmbly">
      <button className={button} onClick={onBack}><ArrowLeftIcon className="size-3.5" /> Integrations</button>
      <button className={button} disabled={busy} onClick={() => void run(refresh)}><RefreshCwIcon className="size-3.5" /> Actualizar</button>
    </PageTopbar>
    <StatStrip cols={4}>
      <Stat label="Cuentas" value={state?.accounts.filter(a => a.enabled).length || 0} sub="activas" />
      <Stat label="Créditos" value={knownCredits} sub="último saldo conocido" />
      <Stat label="Personas" value={people.length} sub={`${people.filter(p => p.email).length} con email`} />
      <Stat label="Pendientes" value={pending.length} sub="enriquecimientos" last />
    </StatStrip>
    <nav className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 overflow-x-auto">
      {[["search", "Buscar", SearchIcon], ["people", "Personas", UsersIcon], ["companies", "Empresas", Building2Icon], ["accounts", "Cuentas y créditos", KeyRoundIcon], ["history", "Actividad", HistoryIcon]].map(([id, label, Icon]) => {
        const Glyph = Icon as React.ElementType;
        return <button key={String(id)} onClick={() => selectTab(String(id))} className={`${button} ${tab === id ? "!border-sky-200 !bg-sky-50 !text-sky-700" : "!border-transparent"}`}><Glyph className="size-3.5" /> {String(label)}</button>;
      })}
    </nav>
    <PageBody>
      <div className="px-5 py-3 space-y-2">
        {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>}
        {notice && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{notice}</div>}
        {review && <div role="dialog" aria-label={review.title} className="border border-amber-200 bg-amber-50 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-slate-900">{review.title}</p><p className="mt-1 text-[12px] text-slate-600 max-w-2xl">{review.description}</p></div>
          <div className="flex gap-2"><button className={button} disabled={busy} onClick={() => setReview(null)}>Cancelar</button><button className={primary} disabled={busy} onClick={() => { const action = review.action; setReview(null); void run(action); }}>Confirmar</button></div>
        </div>}
      </div>
      {!state?.accounts.length && <div className="px-5 pb-5"><div className="border border-sky-200 bg-sky-50 p-4 rounded-lg text-sm"><p className="font-medium">Conecta tu cuenta de RocketReach</p><p className="text-xs text-slate-600 mt-1">Añade una API key y selecciona API clásica o Universal Credits. Puedes conectar varias cuentas y comprobar sus saldos.</p><button className={button + " mt-3"} onClick={() => selectTab("accounts")}>Añadir cuenta</button></div></div>}
      {tab === "search" && <section className="px-5 pb-5 border-b border-slate-200">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex gap-1">{(["people", "companies"] as const).map(k => <button key={k} className={`${button} ${searchKind === k ? "!bg-slate-100" : ""}`} onClick={() => { setSearchKind(k); setResults([]); setSelected(new Set()); setPage(1); }}>{k === "people" ? "Personas" : "Empresas"}</button>)}</div>
          <span className="text-[11px] text-slate-500">Universal: personas 1 crédito / página · empresas 2 créditos / página</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div><Label>Dominios de empresas</Label><TextInput value={domain} onChange={setDomain} placeholder="empresa.com, otra.es" className="w-full" /></div>
          <div><Label>{searchKind === "people" ? "Cargos" : "Nombre de empresa"}</Label><TextInput value={searchKind === "people" ? titles : query} onChange={searchKind === "people" ? setTitles : setQuery} placeholder={searchKind === "people" ? "CEO, CTO, Head of AI" : "Nombre o parte del nombre"} className="w-full" /></div>
          <div><Label>Ubicación</Label><TextInput value={locations} onChange={setLocations} placeholder="Spain, Madrid" className="w-full" /></div>
          <div><Label>Empleados · rangos separados por ;</Label><TextInput value={employees} onChange={setEmployees} placeholder="51-200; 201-500" className="w-full" /></div>
          <div><Label>Palabras clave</Label><TextInput value={query} onChange={setQuery} placeholder="Inteligencia artificial" className="w-full" /></div>
          <div><Label>Cuenta</Label><div className="flex gap-1 flex-wrap"><button className={`${button} ${!accountID ? "!bg-slate-100" : ""}`} onClick={() => setAccountID("")}>Automática</button>{state?.accounts.filter(a => a.enabled).map(a => <button key={a.id} className={`${button} ${accountID === a.id ? "!bg-slate-100" : ""}`} onClick={() => setAccountID(a.id)}>{a.name}</button>)}</div></div>
        </div>
        <details className="mt-4"><summary className="text-[12px] text-slate-600 cursor-pointer">Filtros avanzados de RocketReach · JSON</summary><textarea aria-label="Filtros avanzados" className="mt-2 w-full min-h-24 p-3 text-xs font-mono rounded-md border border-slate-200 outline-none focus:border-sky-400" value={advanced} onChange={e => setAdvanced(e.target.value)} /><p className="text-[11px] text-slate-500 mt-1">Admite los filtros oficiales: company_size, current_title, geo, management_levels, skills, industria, ingresos y financiación dentro de query.</p></details>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button className={primary} disabled={busy || !state?.accounts.length} onClick={() => searchRequest()}><SearchIcon className="size-3.5" /> {busy ? "Procesando…" : "Buscar"}</button>
          <button className={button} disabled={busy} onClick={() => void run(async () => { const name = window.prompt("Nombre de la búsqueda"); if (name) { await api("/saved-searches", "POST", { name, kind: searchKind, params: buildParams(1) }); setNotice("Búsqueda guardada."); } })}>Guardar búsqueda</button>
          <span className="text-[11px] text-slate-400 ml-auto">Página {page} · 50 resultados / página</span>
          <button aria-label="Página anterior" className={button} disabled={busy || page <= 1} onClick={() => searchRequest(page - 1)}><ArrowLeftIcon className="size-3.5" /></button>
          <button aria-label="Página siguiente" className={button} disabled={busy || results.length < 50} onClick={() => searchRequest(page + 1)}><ArrowRightIcon className="size-3.5" /></button>
        </div>
        {searches.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{searches.map(s => <button key={s.id} className={button} onClick={() => { setSearchKind(s.kind); setAdvanced(JSON.stringify(s.params, null, 2)); setDomain(""); setTitles(""); setLocations(""); setEmployees(""); setQuery(""); setPage(1); setNotice(`Cargada: ${s.name}`); }}>{s.name}</button>)}</div>}
        <details className="mt-4"><summary className="text-[12px] text-slate-600 cursor-pointer">Enriquecer una persona o empresa concreta</summary><div className="mt-3 flex gap-2"><TextInput className="flex-1" value={targetQuery} onChange={setTargetQuery} placeholder={searchKind === "people" ? "Email, ID de RocketReach, email o URL de LinkedIn" : "Dominio de la empresa"} /><button className={button} disabled={busy || !targetQuery} onClick={() => setReview({ title: "Enriquecer registro", description: "Esta operación reserva 1 crédito para empresas o 2 para email profesional; para empresas o 2 para email profesional; el acceso depende del plan de RocketReach.", action: async () => { const params = searchKind === "companies" ? { domain: targetQuery } : targetQuery.includes("@") ? { email: targetQuery } : targetQuery.startsWith("https://") ? { linkedin_url: targetQuery } : { id: targetQuery }; await api("/execute", "POST", { operation: searchKind + ".enrich", params, account_id: accountID || undefined, spend: true, idempotency_key: uid() }); selectTab(searchKind === "people" ? "people" : "companies"); setNotice("Registro enriquecido y guardado."); } })}><SparklesIcon className="size-3.5" /> Enriquecer</button></div></details>
      </section>}
      {["search", "people", "companies"].includes(tab) && <section>
        <SectionBar label={tab === "search" ? "Resultados" : companyView ? "Empresas guardadas" : "Personas guardadas"} count={visible.length} />
        <div className="px-5 py-3 flex flex-wrap gap-2 items-center">
          <TextInput value={filter} onChange={setFilter} placeholder="Filtrar resultados guardados" />
          <span className="text-[11px] text-slate-500 mr-auto">{selected.size} seleccionados · máximo 100</span>
          <button className={button} disabled={busy || !selectedRows.length} onClick={() => enrich()}><SparklesIcon className="size-3.5" /> Enriquecer</button>
          {!companyView && <button className={button} disabled={busy || !selectedRows.length} onClick={() => enrich(true)}><PhoneIcon className="size-3.5" /> Emails + teléfonos</button>}
          {!companyView && <button className={primary} disabled={busy || !selectedRows.length} onClick={importSelection}><DownloadIcon className="size-3.5" /> Importar a Warmbly</button>}
          {!companyView && <button className={button} disabled={busy || !selectedRows.some(p => (p as Person).email)} onClick={() => setReview({ title: "Verificar emails", description: "Reserva 1 crédito de verificación por email. Este saldo es independiente del enriquecimiento.", action: async () => { for (const p of selectedRows) if ((p as Person).email) await api("/execute", "POST", { operation: "email.verify", params: { email: (p as Person).email }, account_id: accountID || undefined, spend: true, idempotency_key: uid() }); setNotice("Emails comprobados."); } })}>Verificar emails</button>}
          <button className={button} disabled={!visible.length} onClick={exportCSV}>CSV</button>
        </div>
        {!companyView && <details className="px-5 pb-3"><summary className="text-[11px] text-slate-500 cursor-pointer">Opciones de enriquecimiento e importación</summary><div className="flex flex-wrap gap-4 mt-3 text-[12px] text-slate-600">
          <label className="flex gap-2 items-center"><Checkbox tone="slate" checked={verifiedOnly} onChange={e => setVerifiedOnly(e.target.checked)} /> Solo emails verificados</label>
          <label className="flex gap-2 items-center"><Checkbox tone="slate" checked={updateExisting} onChange={e => setUpdateExisting(e.target.checked)} /> Actualizar existentes</label>
          <label className="flex gap-2 items-center"><Checkbox tone="slate" checked={subscribe} onChange={e => setSubscribe(e.target.checked)} /> Suscribir nuevos contactos</label>
          <label className="flex gap-2 items-center"><Checkbox tone="slate" checked={revealPersonal} onChange={e => setRevealPersonal(e.target.checked)} /> Incluir emails personales</label>
          <label className="flex gap-2 items-center"><Checkbox tone="slate" checked={detailed} onChange={e => setDetailed(e.target.checked)} /> Historial, educación y habilidades (+1 crédito)</label>
        </div><details className="mt-3"><summary className="text-[11px] text-slate-500 cursor-pointer">Mapeo adicional de campos</summary><textarea aria-label="Mapeo de campos" className="mt-2 p-2 w-full min-h-16 font-mono text-xs border rounded-md" value={fieldMap} onChange={e => setFieldMap(e.target.value)} /><p className="text-[11px] text-slate-400">Ejemplo: {`{"title":"cargo","industry":"sector"}`}. Los campos RocketReach y la procedencia se guardan siempre.</p></details></details>}
        {!visible.length ? <EmptyBlock title="Busca tu próximo contacto" body="Busca en RocketReach, selecciona las personas adecuadas y enriquece sus datos antes de importar." /> : <div className="overflow-x-auto"><table className="w-full text-left text-[12px]">
          <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-slate-50 border-y border-slate-200"><tr><th className="px-5 py-2 w-10"><Checkbox aria-label="Seleccionar resultados" checked={visible.length > 0 && visible.slice(0, 100).every(p => selected.has(p.id))} onChange={e => setSelected(e.target.checked ? new Set(visible.slice(0, 100).map(p => p.id)) : new Set())} /></th><th className="py-2">{companyView ? "Empresa" : "Persona"}</th><th>{companyView ? "Sector / tamaño" : "Empresa / cargo"}</th><th>{companyView ? "Dominio" : "Email"}</th><th>Teléfono</th><th className="pr-5">Cuenta</th></tr></thead>
          <tbody>{visible.map(row => companyView ? <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-3"><Checkbox aria-label={`Seleccionar ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td><td className="font-medium text-slate-900">{row.name}</td><td className="text-slate-500">{(row as Company).industry || "—"}<span className="block text-[11px]">{(row as Company).estimated_num_employees ?? "—"} empleados</span></td><td>{(row as Company).primary_domain || "—"}</td><td>{(row as Company).phone || "—"}</td><td className="text-slate-400 pr-5">{row.account_name}</td></tr> : <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60"><td className="px-5 py-3"><Checkbox aria-label={`Seleccionar ${row.name}`} checked={selected.has(row.id)} onChange={() => toggle(row.id)} /></td><td className="font-medium text-slate-900">{row.name || (row as Person).first_name}<span className="block text-[11px] font-normal text-slate-400">{(row as Person).location}</span></td><td className="text-slate-600">{(row as Person).company}<span className="block text-[11px] text-slate-400">{(row as Person).title}</span></td><td>{(row as Person).email || <span className="text-slate-400">Enriquecer para obtener email</span>}<span className={`block text-[10px] ${(row as Person).email_status === "verified" ? "text-emerald-600" : "text-amber-600"}`}>{(row as Person).email_status}</span></td><td>{(row as Person).phone || "—"}</td><td className="text-slate-400 pr-5">{row.account_name}</td></tr>)}</tbody>
        </table></div>}
      </section>}
      {tab === "accounts" && <section className="px-5 pb-6">
        <div className="flex gap-2 items-center flex-wrap pb-5"><span className="text-xs text-slate-500 mr-2">Selección automática</span>{[["priority", "Prioridad"], ["round_robin", "Por turnos"], ["most_credits", "Mayor saldo"]].map(([id, label]) => <button key={id} className={`${button} ${state?.settings.strategy === id ? "!bg-slate-100" : ""}`} disabled={busy} onClick={() => void run(async () => { await api("/settings", "PATCH", { strategy: id }); })}>{label}</button>)}</div>
        <p className="text-[12px] text-slate-500 pb-5 max-w-3xl">Las cuentas agotadas, desactivadas o sin acceso quedan fuera de la selección. Un 429 detiene la operación y respeta la espera de RocketReach. Las cifras reservadas son límites conservadores; actualiza el saldo para ver el consumo real.</p>
        <div className="space-y-3">{state?.accounts.map(a => <div key={a.id} className="border border-slate-200 rounded-lg p-4 bg-white">
          <div className="flex flex-wrap gap-3 items-center"><div className="mr-auto"><p className="font-medium text-sm text-slate-900">{a.name} <span className="ml-2 text-[11px] font-normal text-slate-500">{a.status}</span></p><p className="text-[11px] text-slate-400 mt-1">Saldo actualizado: {a.checked_at ? new Date(a.checked_at).toLocaleString() : "pendiente de comprobar"}</p></div><button className={button} disabled={busy} onClick={() => void run(async () => { await api(`/accounts/${a.id}/refresh`, "POST", {}); setNotice("Saldo actualizado."); })}>Comprobar clave y créditos</button><label className="flex items-center gap-2 text-xs text-slate-600"><Checkbox tone="slate" checked={a.enabled} onChange={e => void run(async () => { await api(`/accounts/${a.id}`, "PATCH", { enabled: e.target.checked }); })} /> Activa</label></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">{[["Saldo de enriquecimiento", a.balances?.lead_credit?.left_over], ["Lookup", a.balances?.lookup?.left_over], ["Exportación", a.balances?.export?.left_over], ["Reserva hoy", a.spent_day === new Date().toISOString().slice(0, 10) ? a.spent : 0]].map(([label, value]) => <div key={String(label)}><span className="block text-[10px] uppercase tracking-wider text-slate-400">{String(label)}</span><span className="text-xl tabular-nums text-slate-800">{value ?? "—"}</span></div>)}</div>
          <div className="flex gap-2 items-center mt-4 text-xs text-slate-500">API{[["legacy", "Clásica"], ["universal", "Universal Credits"]].map(([id, label]) => <button key={id} className={`${button} ${(a.api_mode || "legacy") === id ? "!bg-slate-100" : ""}`} disabled={busy} onClick={() => void run(async () => { await api(`/accounts/${a.id}`, "PATCH", { api_mode: id }); })}>{label}</button>)}</div><div className="flex flex-wrap gap-4 mt-4">{([['priority', 'Prioridad'], ['reserve', 'Reserva mínima'], ['daily_budget', 'Límite diario']] as const).map(([field, label]) => <div key={field}><Label>{label}</Label><NumberInput value={a[field]} onChange={value => setState(prev => prev ? { ...prev, accounts: prev.accounts.map(x => x.id === a.id ? { ...x, [field]: value } : x) } : prev)} onCommit={value => void run(async () => { await api(`/accounts/${a.id}`, "PATCH", { [field]: value }); })} min={0} max={1000000} /></div>)}<button className={button + " mt-5"} disabled={busy} onClick={() => setReview({ title: "Desconectar cuenta", description: `Se eliminará la clave de ${a.name} del plugin. Los contactos importados en Warmbly se conservan.`, action: async () => { await api(`/accounts/${a.id}`, "DELETE"); setNotice("Cuenta desconectada."); } })}>Desconectar</button></div>
        </div>)}</div>
        <div className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-medium text-sm text-slate-900 mb-4">Añadir cuenta de RocketReach</h3><div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div><Label>Nombre</Label><TextInput value={accountName} onChange={setAccountName} placeholder="RocketReach principal" className="w-full" /></div><div><Label>API key</Label><TextInput type="password" value={key} onChange={setKey} autoComplete="off" placeholder="Clave de RocketReach" className="w-full" /></div><div><Label>Límite diario</Label><NumberInput value={dailyBudget} onChange={setDailyBudget} min={0} max={1000000} /></div><div><Label>Reserva mínima</Label><NumberInput value={reserve} onChange={setReserve} min={0} max={1000000} /></div><div><Label>Prioridad</Label><NumberInput value={priority} onChange={setPriority} min={0} max={10000} /></div>
        </div><div className="mt-4 flex items-center gap-3 flex-wrap"><span className="text-xs text-slate-500">API de la nueva cuenta</span>{[["legacy", "Clásica"], ["universal", "Universal Credits"]].map(([id, label]) => <button key={id} className={`${button} ${apiMode === id ? "!bg-slate-100" : ""}`} onClick={() => setApiMode(id)}>{label}</button>)}<button className={primary} disabled={busy || !key || !accountName} onClick={() => void run(async () => { await api("/accounts", "POST", { name: accountName, api_key: key, daily_budget: dailyBudget, reserve, priority, api_mode: apiMode }); setKey(""); setAccountName(""); setNotice("Cuenta guardada. Comprueba sus créditos para validar el acceso."); })}>Guardar cuenta</button><span className="text-[11px] text-slate-400">La clave se cifra en el servidor y no vuelve a mostrarse.</span></div></div>
      </section>}
      {tab === "history" && <section className="px-5 pb-5">
        {jobs.length > 0 && <><SectionBar label="Enriquecimientos asíncronos" count={jobs.length} />{jobs.map(job => <div key={job.id} className="flex items-center gap-3 py-3 border-b border-slate-100 text-xs"><span className="font-medium">{job.operation}</span><span className="text-slate-500">{job.status}{job.error_code ? ` · ${job.error_code}` : ""}</span><span className="font-mono text-[10px] text-slate-400 ml-auto">{job.request_id}</span>{job.status === "pending" && <button className={button} disabled={busy || job.next_poll_at > Date.now()} onClick={() => void run(async () => { await api(`/jobs/${job.id}/poll`, "POST", {}); })}>Consultar</button>}</div>)}</>}
        <SectionBar label="Actividad del plugin" count={history.length} />{history.map(item => <div key={item.id} className="py-3 border-b border-slate-100 flex flex-wrap gap-3 text-xs"><span className="font-medium text-slate-700">{item.action}</span><span className="text-slate-400 font-mono text-[10px] break-all">{JSON.stringify(item.result)}</span><time className="text-slate-400 ml-auto">{new Date(item.at).toLocaleString()}</time></div>)}
      </section>}
    </PageBody>
  </Page>;
}
