"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CalendarClock,
  Database,
  FileCheck2,
  LogOut,
  Scale,
  ShieldCheck,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import {
  confirmSupplierSampleUpload,
  createSupplierAssetDeclaration,
  requestSupplierSampleUpload,
} from "@/lib/actions/supplier-portal-actions";
import type {
  SupplierAsset,
  SupplierBuild,
  SupplierWorkspaceData,
} from "@/lib/supplier/workspace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SupplierPortalWorkspaceProps = {
  data: SupplierWorkspaceData;
};

const modalityOptions = [
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "timeseries",
  "document",
] as const;

const refreshOptions = [
  "one_shot",
  "scheduled",
  "on_event",
  "perpetual",
] as const;

const sensitivityOptions = ["public", "confidential", "pii", "special"] as const;

function formatDate(value: string | null) {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "0";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatBytes(value: number | null | undefined) {
  if (!value) {
    return "No sample";
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Pending";
  }

  return `${Math.round(value * 100)}%`;
}

function sentenceCase(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function fieldValue(value: unknown, fallback = "Not provided") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function statusClassName(state: string | null | undefined) {
  if (state === "approved" || state === "active" || state === "sample_received") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (state === "rights_review" || state === "full_active" || state === "qa") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (state === "blocked" || state === "retired" || state === "terminated") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-gray-200 bg-gray-50 text-gray-600";
}

function Pill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-[var(--ds-shadow-surface)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
        <Icon className="h-4 w-4 text-emerald-600" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-gray-950">
        {value}
      </p>
    </div>
  );
}

function TextField({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase text-gray-400">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus-visible:border-emerald-600 focus-visible:ring-[3px] focus-visible:ring-emerald-600/20"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  options,
}: {
  label: string;
  name: string;
  options: readonly string[];
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-medium uppercase text-gray-400">{label}</span>
      <select
        name={name}
        className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus-visible:border-emerald-600 focus-visible:ring-[3px] focus-visible:ring-emerald-600/20"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {sentenceCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AssetCard({ asset }: { asset: SupplierAsset }) {
  const rights = asset.rightsSummary;
  const rightsReady =
    rights.ownershipConfirmed === true && rights.aiTrainingRights === true;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-[var(--ds-shadow-surface)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-950">{asset.name}</p>
          <p className="mt-1 text-xs text-gray-500">
            {asset.id} / {sentenceCase(asset.modality)}
          </p>
        </div>
        <Pill className={statusClassName(asset.state)}>
          {sentenceCase(asset.state)}
        </Pill>
      </div>

      <p className="mt-4 text-sm leading-6 text-gray-600">
        {fieldValue(
          asset.declaredVolume.summary,
          "Volume and schema detail will appear after declaration.",
        )}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase text-gray-400">Refresh</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {sentenceCase(asset.refreshPolicy)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-gray-400">Sensitivity</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {sentenceCase(asset.sensitivity)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-gray-400">Sample</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {asset.sampleUpload.receivedAt
              ? formatDate(asset.sampleUpload.receivedAt)
              : "Pending"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill
          className={
            rightsReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }
        >
          Rights {rightsReady ? "declared" : "review needed"}
        </Pill>
        <Pill className="border-gray-200 bg-gray-50 text-gray-700">
          Contract {sentenceCase(asset.contract.state)}
        </Pill>
        <Pill className="border-gray-200 bg-gray-50 text-gray-700">
          {formatBytes(asset.sampleUpload.bytes)}
        </Pill>
      </div>
    </article>
  );
}

function BuildCard({ build }: { build: SupplierBuild }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-[var(--ds-shadow-surface)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-950">{build.title}</p>
          <p className="mt-1 text-xs text-gray-500">
            {build.opportunity.title ?? "Supplier engagement"} / {build.id}
          </p>
        </div>
        <Pill className={statusClassName(build.state)}>
          {sentenceCase(build.state)}
        </Pill>
      </div>

      <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-gray-100 bg-gray-100 sm:grid-cols-4">
        {[
          ["ETA", formatDate(build.etaAt)],
          ["Quality", formatPercent(build.qScore)],
          ["Gate", sentenceCase(build.latestGate.key)],
          ["Gate state", sentenceCase(build.latestGate.state)],
        ].map(([label, value]) => (
          <div key={label} className="bg-white p-3">
            <p className="text-xs font-medium uppercase text-gray-400">
              {label}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function AssetDeclarationForm({ readOnly }: { readOnly: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const result = await createSupplierAssetDeclaration({
        name: String(formData.get("name") ?? ""),
        modality: String(formData.get("modality") ?? ""),
        declaredVolume: String(formData.get("declaredVolume") ?? ""),
        refreshPolicy: String(formData.get("refreshPolicy") ?? ""),
        sensitivity: String(formData.get("sensitivity") ?? ""),
        intendedAvailability: String(formData.get("intendedAvailability") ?? ""),
        rightsSummary: String(formData.get("rightsSummary") ?? ""),
        ownershipConfirmed: formData.get("ownershipConfirmed") === "on",
        aiTrainingRights: formData.get("aiTrainingRights") === "on",
        derivativeRights: formData.get("derivativeRights") === "on",
        endUserConsent: formData.get("endUserConsent") === "on",
        thirdPartyContent: formData.get("thirdPartyContent") === "on",
      });

      if (!("ok" in result)) {
        setError(result.error);
        return;
      }

      form.reset();
      setMessage(`Asset ${result.assetId} declared for Caudals review.`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">Declare an asset</p>
          <p className="mt-1 text-sm text-gray-500">
            Add a candidate dataset with rights posture before sending samples.
          </p>
        </div>
        <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
          Managed intake
        </Pill>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Asset name"
            name="name"
            required
            placeholder="Store receipt corpus"
          />
          <TextField
            label="Volume or schema"
            name="declaredVolume"
            required
            placeholder="125k PDFs plus JSON fields"
          />
          <SelectField label="Modality" name="modality" options={modalityOptions} />
          <SelectField
            label="Refresh"
            name="refreshPolicy"
            options={refreshOptions}
          />
          <SelectField
            label="Sensitivity"
            name="sensitivity"
            options={sensitivityOptions}
          />
          <SelectField
            label="Availability"
            name="intendedAvailability"
            options={["private", "catalogue"]}
          />
        </div>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase text-gray-400">
            Rights summary
          </span>
          <textarea
            name="rightsSummary"
            required
            rows={4}
            placeholder="Describe ownership, consent basis, third-party content, geography, and any exclusivity constraints."
            className="resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-950 outline-none transition focus-visible:border-emerald-600 focus-visible:ring-[3px] focus-visible:ring-emerald-600/20"
          />
        </label>

        <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
          {[
            ["ownershipConfirmed", "We own or control this data"],
            ["aiTrainingRights", "AI-training use is permitted"],
            ["derivativeRights", "Derived datasets are permitted"],
            ["endUserConsent", "Consent basis is documented"],
            ["thirdPartyContent", "Third-party content may be present"],
          ].map(([name, label]) => (
            <label key={name} className="flex items-start gap-2">
              <input
                name={name}
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>

        {error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={readOnly || isPending}
          className="bg-gray-950 text-white hover:bg-gray-800"
        >
          <Database className="mr-2 h-4 w-4" />
          {isPending ? "Declaring..." : "Declare asset"}
        </Button>
      </form>
    </section>
  );
}

function SampleUploadForm({
  assets,
  readOnly,
}: {
  assets: SupplierAsset[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadableAssets = useMemo(
    () => assets.filter((asset) => !["blocked", "retired"].includes(asset.state)),
    [assets],
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0] ?? null;
    setMessage(null);
    setError(null);

    if (!file) {
      setError("Choose a representative sample file first.");
      return;
    }

    startTransition(async () => {
      const intent = await requestSupplierSampleUpload({
        assetId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      });

      if (!("ok" in intent)) {
        setError(intent.error);
        return;
      }

      const uploadResponse = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.uploadHeaders,
        body: file,
      });

      if (!uploadResponse.ok) {
        setError("The signed upload failed. Request a fresh upload URL.");
        return;
      }

      const confirmed = await confirmSupplierSampleUpload({
        assetId: intent.assetId,
        sampleUri: intent.sampleUri,
      });

      if (!("ok" in confirmed)) {
        setError(confirmed.error);
        return;
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setMessage(`Sample received for ${confirmed.assetId}.`);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">Upload a sample</p>
          <p className="mt-1 text-sm text-gray-500">
            Send a small representative file through a short-lived signed URL.
          </p>
        </div>
        <Pill className="border-gray-200 bg-gray-50 text-gray-700">
          100 MB max
        </Pill>
      </div>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase text-gray-400">Asset</span>
          <select
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus-visible:border-emerald-600 focus-visible:ring-[3px] focus-visible:ring-emerald-600/20"
          >
            {uploadableAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase text-gray-400">
            Sample file
          </span>
          <input
            ref={fileInputRef}
            type="file"
            className="block w-full rounded-md border border-gray-200 bg-white text-sm text-gray-600 file:mr-3 file:h-10 file:border-0 file:bg-gray-950 file:px-3 file:text-sm file:font-medium file:text-white"
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {message}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={readOnly || isPending || uploadableAssets.length === 0}
          variant="outline"
          className="bg-white"
        >
          <UploadCloud className="mr-2 h-4 w-4" />
          {isPending ? "Uploading..." : "Upload sample"}
        </Button>
      </form>
    </section>
  );
}

export function SupplierPortalWorkspace({ data }: SupplierPortalWorkspaceProps) {
  const readOnly = data.role === "supplier_viewer";

  return (
    <main className="min-h-screen bg-[var(--ds-canvas)] text-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Supplier portal v0
              </Pill>
              <Pill className="border-gray-200 bg-white text-gray-600">
                {data.authOrganization.name}
              </Pill>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
              Supplier Portal
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {data.supplier.displayName} can declare candidate data assets,
              send representative samples, and track Caudals build progress
              without operating marketplace listings or buyer support.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="bg-white">
              <Link href="/contact">Contact operator</Link>
            </Button>
            <Button asChild className="bg-gray-950 text-white hover:bg-gray-800">
              <Link href="/auth/sign-out">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric
            label="Assets"
            value={formatNumber(data.summary.assetCount)}
            icon={Database}
          />
          <Metric
            label="Samples"
            value={formatNumber(data.summary.samplesReceived)}
            icon={UploadCloud}
          />
          <Metric
            label="Builds"
            value={formatNumber(data.summary.buildsInFlight)}
            icon={CalendarClock}
          />
          <Metric
            label="Rights approved"
            value={formatNumber(data.summary.rightsApproved)}
            icon={ShieldCheck}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_27rem]">
          <div className="space-y-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-950">
                  Asset registry
                </p>
                <p className="text-sm text-gray-500">
                  Rights, sensitivity, sample status, and contract posture stay
                  visible on every asset.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Pill className="border-gray-200 bg-white text-gray-700">
                  <Scale className="mr-1.5 h-3.5 w-3.5" />
                  Managed licensing
                </Pill>
                <Pill className="border-gray-200 bg-white text-gray-700">
                  <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />
                  Operator reviewed
                </Pill>
              </div>
            </div>

            {data.assets.length > 0 ? (
              data.assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))
            ) : (
              <section className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-[var(--ds-shadow-surface)]">
                <p className="text-lg font-semibold text-gray-950">
                  No supplier assets have been declared yet.
                </p>
                <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
                  Declare a candidate asset to start the Caudals feasibility and
                  rights review workflow.
                </p>
              </section>
            )}

            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-gray-950">
                  Build participation
                </p>
                <p className="text-sm text-gray-500">
                  Track active Caudals builds connected to this supplier account.
                </p>
              </div>
              {data.builds.length > 0 ? (
                data.builds.map((build) => (
                  <BuildCard key={build.id} build={build} />
                ))
              ) : (
                <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
                  <p className="text-sm font-semibold text-gray-950">
                    No active builds are linked yet.
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Caudals operators will attach builds after qualification and
                    feasibility review.
                  </p>
                </section>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <AssetDeclarationForm readOnly={readOnly} />
            <SampleUploadForm assets={data.assets} readOnly={readOnly} />
          </aside>
        </section>
      </div>
    </main>
  );
}
