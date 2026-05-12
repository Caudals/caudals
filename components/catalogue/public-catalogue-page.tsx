import Link from "next/link";
import {
  ArrowRight,
  Database,
  FileCheck2,
  Filter,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Header } from "@/components/ui/header";
import { Button } from "@/components/ui/button";
import { MarketingFooter } from "@/components/marketing/footer";
import { landingModePublicNavigationLinks } from "@/lib/landing-mode";
import type {
  PublicCatalogueData,
  PublicCatalogueListing,
} from "@/lib/catalogue/public-catalogue";

const modalityOptions = [
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "timeseries",
  "document",
];

const licenseTierOptions = [
  "standard",
  "evaluation",
  "enterprise",
  "exclusive",
];

function sentenceCase(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatNumber(value: number | null) {
  if (value === null) {
    return "Not published";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "Review";
  }

  return `${Math.round(value * 100)}%`;
}

function formatPrice(listing: PublicCatalogueListing) {
  if (listing.pricing.priceCents === null) {
    return "Private terms";
  }

  const amount = listing.pricing.priceCents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: listing.pricing.currency,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function previewGateLabel(listing: PublicCatalogueListing) {
  if (listing.samplePreview.decision.allowed) {
    return "Public preview";
  }

  if (listing.samplePreview.decision.reason === "operator_approval_required") {
    return "Operator approval";
  }

  if (listing.samplePreview.decision.reason === "missing_preview") {
    return "Preview pending";
  }

  return "NDA required";
}

function trustSignals(listing: PublicCatalogueListing) {
  const permits = listing.composedPermits;

  return [
    {
      label: "Training",
      active: permits.train === true || permits.training === true,
    },
    {
      label: "Fine-tuning",
      active: permits.finetune === true || permits.fineTuning === true,
    },
    {
      label: "Evaluation",
      active: permits.eval === true || permits.evaluation === true,
    },
    {
      label: "Commercial inference",
      active:
        permits.commercial_inference === true ||
        permits.commercialInference === true,
    },
  ];
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-l border-gray-100 pl-4">
      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-gray-950">
        {value}
      </p>
    </div>
  );
}

function CatalogueFilters({ data }: { data: PublicCatalogueData }) {
  return (
    <form
      action="/catalogue"
      className="grid gap-3 border-y border-gray-100 bg-gray-50/60 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_180px_180px_auto] sm:items-end lg:px-6"
    >
      <label className="flex min-w-0 flex-col gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
          <Search className="h-3.5 w-3.5" />
          Search
        </span>
        <input
          name="q"
          defaultValue={data.filters.query}
          placeholder="Search datasets"
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        />
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className="text-xs font-semibold uppercase text-gray-500">
          Modality
        </span>
        <select
          name="modality"
          defaultValue={data.filters.modality}
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        >
          <option value="">All modalities</option>
          {modalityOptions.map((modality) => (
            <option key={modality} value={modality}>
              {sentenceCase(modality)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className="text-xs font-semibold uppercase text-gray-500">
          License tier
        </span>
        <select
          name="licenseTier"
          defaultValue={data.filters.licenseTier}
          className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
        >
          <option value="">All tiers</option>
          {licenseTierOptions.map((tier) => (
            <option key={tier} value={tier}>
              {sentenceCase(tier)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <Button
          type="submit"
          className="h-10 rounded-md bg-black px-4 text-white"
        >
          <Filter className="mr-2 h-4 w-4" />
          Apply
        </Button>
        <Button asChild variant="outline" className="h-10 rounded-md">
          <Link href="/catalogue">Reset</Link>
        </Button>
      </div>
    </form>
  );
}

function CatalogueCard({ listing }: { listing: PublicCatalogueListing }) {
  const signals = trustSignals(listing);

  return (
    <article className="flex min-h-[420px] flex-col rounded-lg border border-gray-200 bg-white shadow-[var(--ds-shadow-surface)]">
      <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-emerald-700">
            {sentenceCase(listing.dataset.modality)}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-tight text-gray-950">
            {listing.title}
          </h2>
          <p className="mt-2 text-sm text-gray-500">{listing.dataset.name}</p>
        </div>
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-right text-emerald-800">
          <p className="text-xs font-semibold uppercase">Quality</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatPercent(listing.qualityScore)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-gray-100 text-sm">
        <div className="bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-400">
            Records
          </p>
          <p className="mt-1 font-semibold tabular-nums text-gray-950">
            {formatNumber(listing.version.recordCount)}
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-400">
            Version
          </p>
          <p className="mt-1 font-semibold text-gray-950">
            {listing.version.label}
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-400">
            Refresh
          </p>
          <p className="mt-1 font-semibold text-gray-950">
            {sentenceCase(listing.refreshCadence)}
          </p>
        </div>
        <div className="bg-white p-4">
          <p className="text-xs font-semibold uppercase text-gray-400">
            Price
          </p>
          <p className="mt-1 font-semibold text-gray-950">
            {formatPrice(listing)}
          </p>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Permitted use
          </p>
          <div className="flex flex-wrap gap-2">
            {signals.map((signal) => (
              <span
                key={signal.label}
                className={
                  signal.active
                    ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                    : "rounded-full bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-400"
                }
              >
                {signal.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-md border border-gray-100 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
              <LockKeyhole className="h-3.5 w-3.5" />
              Preview gate
            </p>
            <p className="mt-2 font-semibold text-gray-950">
              {previewGateLabel(listing)}
            </p>
          </div>
          <div className="rounded-md border border-gray-100 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
              <FileCheck2 className="h-3.5 w-3.5" />
              Privacy
            </p>
            <p className="mt-2 font-semibold text-gray-950">
              {sentenceCase(listing.privacy.state)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-3 border-t border-gray-100 p-5 sm:flex-row">
        <Button asChild className="h-10 rounded-md bg-black text-white">
          <Link
            href={`/contact?dataset=${encodeURIComponent(listing.id)}`}
            className="min-w-0"
          >
            Request access
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-10 rounded-md">
          <Link href={`/contact?brief=${encodeURIComponent(listing.dataset.id)}`}>
            Discuss terms
          </Link>
        </Button>
      </div>
    </article>
  );
}

function EmptyCatalogue() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-gray-50 text-gray-500">
        <Database className="h-5 w-5" />
      </div>
      <h2 className="mt-5 text-2xl font-semibold text-gray-950">
        No public listings yet
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-500">
        {
          "Current catalogue inventory is still being cleared for public review. Talk with Caudals for private availability."
        }
      </p>
      <div className="mt-6">
        <Button asChild className="rounded-md bg-black text-white">
          <Link href="/contact">Talk with Caudals</Link>
        </Button>
      </div>
    </section>
  );
}

export function PublicCataloguePage({ data }: { data: PublicCatalogueData }) {
  return (
    <div className="min-h-screen bg-white text-black">
      <Header links={[...landingModePublicNavigationLinks]} hideActions />
      <main className="mx-auto w-full max-w-7xl px-6 pb-24 pt-10 sm:px-8 lg:px-12">
        <section className="border-b border-gray-100 pb-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase text-emerald-800">
                <Sparkles className="h-3.5 w-3.5" />
                Public catalogue
              </p>
              <h1 className="mt-5 text-4xl font-normal leading-tight text-gray-950 sm:text-5xl">
                Curated datasets for buyer review
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-gray-500">
                {
                  "Browse released dataset families with public trust evidence. Request access when you need NDA-gated samples, private terms, or a custom build."
                }
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
              <SummaryMetric
                label="Listings"
                value={String(data.summary.listingCount)}
              />
              <SummaryMetric
                label="Modalities"
                value={String(data.summary.modalities.length)}
              />
              <SummaryMetric
                label="Avg QA"
                value={formatPercent(data.summary.averageQualityScore)}
              />
              <SummaryMetric
                label="Refresh"
                value={sentenceCase(data.summary.nextRefreshCadence)}
              />
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <CatalogueFilters data={data} />
        </section>

        {data.listings.length > 0 ? (
          <section
            className={
              data.listings.length === 1
                ? "mx-auto mt-8 grid w-full max-w-3xl gap-5"
                : "mt-8 grid gap-5 lg:grid-cols-2"
            }
          >
            {data.listings.map((listing) => (
              <CatalogueCard key={listing.id} listing={listing} />
            ))}
          </section>
        ) : (
          <div className="mt-8">
            <EmptyCatalogue />
          </div>
        )}
      </main>
      <MarketingFooter forceLandingMode />
    </div>
  );
}
