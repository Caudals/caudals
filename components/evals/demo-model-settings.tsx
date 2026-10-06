"use client";

import { useEffect, useState } from "react";
import { t } from "@/lib/evals/messages/en";
import { evalRequest } from "./api";
import { Action, Field, Section, SelectField, Status } from "./primitives";
import { notify } from "./overlays";

type DemoSettings = { modelId: string; provider: string };
type DemoModel = { id: string; label: string };

export function DemoModelSettings({ orgId }: { orgId: string }) {
  const [settings, setSettings] = useState<DemoSettings | null>(null);
  const [models, setModels] = useState<DemoModel[] | null>(null);
  const [modelId, setModelId] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const current = await evalRequest<DemoSettings>(`/engine/demo?orgId=${encodeURIComponent(orgId)}`);
      setSettings(current);
      setModelId(current.modelId);
      setModels(await evalRequest<DemoModel[]>("/engine/demo/models"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  // The parent remounts this section on workspace changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [orgId]);

  const visible = (models ?? []).filter((model) => model.id === modelId || `${model.id} ${model.label}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const listed = models?.some((model) => model.id === modelId) ?? false;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const saved = await evalRequest<{ modelId: string }>("/engine/demo", "PUT", { orgId, modelId });
      setSettings((current) => current ? { ...current, modelId: saved.modelId } : current);
      notify(t("engineDemoSaved"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title={t("engineDemoTitle")} description={t("engineDemoHelp")}>
      {error && <Status error action={<Action variant="secondary" size="sm" onClick={() => void load()} disabled={loading || pending}>{t("retry")}</Action>}>{error}</Status>}
      {loading && <p className="p-loading" role="status"><span className="p-spinner" aria-hidden="true" />{t("engineLoadingModels")}</p>}
      {settings && (
        <form className="p-stack eval-demo-model-form" onSubmit={save}>
          {models && models.length > 12 && <Field id="demo-model-filter" label={t("engineFilterModels")} value={filter} onChange={(event) => setFilter(event.target.value)} disabled={pending} />}
          <SelectField id="demo-model" label={t("engineModel")} hint={`${settings.provider} · ${t("engineDemoProvider")}`} value={modelId} onChange={(event) => setModelId(event.target.value)} disabled={!models || loading || pending}>
            {!listed && <option value={modelId}>{modelId}</option>}
            {visible.map((model) => <option key={model.id} value={model.id}>{model.label === model.id ? model.id : `${model.label} · ${model.id}`}</option>)}
          </SelectField>
          <div className="p-row">
            <Action type="submit" disabled={!listed || loading || pending || modelId === settings.modelId}>{pending ? t("saving") : t("save")}</Action>
          </div>
        </form>
      )}
    </Section>
  );
}
