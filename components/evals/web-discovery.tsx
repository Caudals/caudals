"use client";

/**
 * "Find sources on the web": the reading-sources model searches the public
 * web for pages that document the product (help centre, FAQs, terms,
 * pricing). The person picks which to add; each is captured like any website
 * source, so tests still cite frozen excerpts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Globe, Search } from "lucide-react";
import { evalRequest } from "./api";
import { Action, Badge, Status } from "./primitives";
import { notify } from "./overlays";
import { t, tv } from "@/lib/evals/messages/en";

type Suggestion = { url: string; title: string; why: string; same_site: boolean };
type Discovery = { id: string; status: "queued" | "completed" | "failed" | "skipped"; reason_code: string | null; suggestions: Suggestion[]; created_at: string } | null;

export function WebDiscovery({
  orgId,
  evaluationId,
  projectId,
  onStarted,
  open,
  onOpenChange: setOpen,
}: {
  orgId: string;
  evaluationId: string;
  projectId: string;
  onStarted: (sources: Array<{ id: string; title: string }>) => void;
  /** The trigger lives with the other "add material" actions; the panel renders here. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [job, setJob] = useState<Discovery>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "search" | "add">("");
  const preselected = useRef<string | null>(null);

  const load = useCallback(async () => {
    const value = await evalRequest<Discovery>(`/evaluations/${evaluationId}/web-sources?orgId=${encodeURIComponent(orgId)}`);
    setJob(value);
    if (value?.status === "completed" && preselected.current !== value.id) {
      preselected.current = value.id;
      setSelected(new Set(value.suggestions.filter((item) => item.same_site).map((item) => item.url)));
    }
    return value;
  }, [evaluationId, orgId]);

  // Poll while a search runs; a finished one stays as it is.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      try {
        const value = await load();
        if (!stopped && value?.status === "queued") timer = window.setTimeout(() => void tick(), 3000);
      } catch {
        if (!stopped) timer = window.setTimeout(() => void tick(), 6000);
      }
    };
    void tick();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [open, load, job?.id, job?.status]);

  async function search() {
    setBusy("search");
    setError("");
    try {
      await evalRequest(`/evaluations/${evaluationId}/web-sources`, "POST", { orgId });
      await load();
    } catch (value) {
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setBusy("");
    }
  }

  async function add() {
    if (!job || !selected.size) return;
    setBusy("add");
    setError("");
    const started: Array<{ id: string; title: string }> = [];
    try {
      for (const item of job.suggestions.filter((suggestion) => selected.has(suggestion.url))) {
        const input = { orgId, evaluationId, projectId, url: item.url, title: item.title.slice(0, 200), pageLimit: 3 };
        const result = await evalRequest<{ sourceId: string }>("/sources/websites", "POST", input, `web-discovery-${job.id}-${item.url}`.slice(0, 200));
        started.push({ id: result.sourceId, title: item.title });
      }
      notify(tv("webSourcesAdded", { count: started.length }));
      onStarted(started);
      setOpen(false);
      setJob(null);
      setSelected(new Set());
    } catch (value) {
      if (started.length) onStarted(started);
      setError(value instanceof Error ? value.message : t("error"));
    } finally {
      setBusy("");
    }
  }

  if (!open) return null;

  const running = job?.status === "queued" || busy === "search";
  return (
    <section className="p-discovery" aria-label={t("findWebSources")}>
      <div className="p-discovery-head">
        <span className="p-kicker">{t("findWebSources")}</span>
        <p className="p-explainer">{t("findWebSourcesHelp")}</p>
      </div>
      {error && <Status error>{error}</Status>}
      {running ? (
        <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("searchingWeb")}</p>
      ) : job?.status === "completed" ? (
        <ul className="p-discovery-list">
          {job.suggestions.map((item) => (
            <li key={item.url}>
              <label className="p-discovery-item">
                <input
                  type="checkbox"
                  checked={selected.has(item.url)}
                  onChange={(event) => setSelected((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(item.url);
                    else next.delete(item.url);
                    return next;
                  })}
                />
                <span className="p-discovery-body">
                  <span className="p-discovery-title">
                    <Globe aria-hidden="true" />
                    {item.title}
                    {item.same_site && <Badge tone="info">{t("officialSite")}</Badge>}
                  </span>
                  <span className="p-cell-meta">{item.url.replace(/^https:\/\//, "")}</span>
                  {item.why && <span className="p-discovery-why">{item.why}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : job?.status === "failed" ? (
        <Status tone="warn">{job.reason_code === "no_new_sources_found" ? t("noWebSourcesFound") : t("webSearchFailed")}</Status>
      ) : null}
      <div className="p-row">
        {job?.status === "completed" ? (
          <Action variant="secondary" onClick={() => void add()} disabled={!selected.size || !!busy}>
            {busy === "add" ? t("working") : tv("addWebSources", { count: selected.size })}
          </Action>
        ) : (
          <Action variant="secondary" onClick={() => void search()} disabled={running || !!busy}>
            <Search aria-hidden="true" />
            {job?.status === "failed" ? t("searchAgain") : t("searchTheWeb")}
          </Action>
        )}
        {job?.status === "completed" && (
          <Action variant="ghost" onClick={() => void search()} disabled={!!busy}>{t("searchAgain")}</Action>
        )}
        <Action variant="ghost" onClick={() => setOpen(false)}>{t("close")}</Action>
      </div>
    </section>
  );
}
