import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarClock,
  CreditCard,
  Database,
  FileArchive,
  Gauge,
  LogOut,
  PlugZap,
  RefreshCw,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  BuyerDelivery,
  BuyerIntegration,
  BuyerInvoice,
  BuyerSubscription,
  BuyerWorkspaceData,
} from "@/lib/buyer/workspace";
import { cn } from "@/lib/utils";

type BuyerDeliveryWorkspaceProps = {
  data: BuyerWorkspaceData;
};

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

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "Pending";
  }

  return `${Math.round(value * 100)}%`;
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
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

function shortHash(value: string | null) {
  if (!value) {
    return "No hash";
  }

  return value.length > 42 ? `${value.slice(0, 42)}...` : value;
}

function metricLabel(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value : "Not provided";
}

function metadataLabel(
  metadata: Record<string, unknown>,
  key: string,
  fallback = "Not provided",
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getSummary(delivery: BuyerDelivery) {
  const summary = delivery.delta.summary.summary;
  return typeof summary === "string"
    ? summary
    : "Latest buyer delivery with dataset, scorecard, privacy, and delta evidence.";
}

function statusClassName(state: string | null | undefined) {
  if (state === "accepted" || state === "active" || state === "published") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (state === "ready" || state === "sent" || state === "review") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (state === "disputed" || state === "blocked" || state === "fail") {
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

function ScoreBar({ label, value }: { label: string; value: number }) {
  const width = Math.round(value * 100);

  return (
    <div className="grid gap-2 sm:grid-cols-[11rem_1fr_3.5rem] sm:items-center">
      <p className="truncate text-sm font-medium text-gray-700">{label}</p>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-emerald-600"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-sm tabular-nums text-gray-500">{width}%</p>
    </div>
  );
}

function EvidenceGrid({ delivery }: { delivery: BuyerDelivery }) {
  const entries = [
    ["Manifest", metricLabel(delivery.delta.manifestUri)],
    ["Manifest hash", shortHash(delivery.delta.manifestHash)],
    ["Content hash", shortHash(delivery.version.contentHash)],
    ["Receipt object", metricLabel(String(delivery.receipt.object ?? ""))],
    ["Contract", metricLabel(delivery.contract.id)],
    ["Contract state", sentenceCase(delivery.contract.state)],
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-xl border border-gray-100 bg-gray-100 md:grid-cols-2">
      {entries.map(([label, value]) => (
        <div key={label} className="bg-white p-3">
          <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
          <p className="mt-1 break-words font-mono text-xs text-gray-700">
            {value}
          </p>
        </div>
      ))}
    </div>
  );
}

function DeliveryCard({ delivery }: { delivery: BuyerDelivery }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-[var(--ds-shadow-surface)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-950">
            {delivery.dataset.name}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {delivery.version.label ?? "Version pending"} /{" "}
            {sentenceCase(delivery.dataset.modality)}
          </p>
        </div>
        <Pill className={statusClassName(delivery.state)}>
          {sentenceCase(delivery.state)}
        </Pill>
      </div>

      <p className="mt-4 text-sm leading-6 text-gray-600">
        {getSummary(delivery)}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase text-gray-400">Records</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {formatNumber(delivery.delta.totalRecords || delivery.version.recordCount)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-gray-400">Quality</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {formatPercent(delivery.scorecard.compositeScore)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-gray-400">Updated</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {formatDate(delivery.updatedAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill className="border-gray-200 bg-gray-50 text-gray-700">
          {sentenceCase(delivery.channel)}
        </Pill>
        <Pill
          className={
            delivery.delta.rightsReverified
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }
        >
          Rights {delivery.delta.rightsReverified ? "verified" : "pending"}
        </Pill>
        <Pill
          className={
            delivery.delta.privacyVerified
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }
        >
          Privacy {delivery.delta.privacyVerified ? "verified" : "pending"}
        </Pill>
      </div>
    </article>
  );
}

function ScorecardPanel({ delivery }: { delivery: BuyerDelivery }) {
  const licenseTrain = delivery.version.composedPermits.train === true;
  const commercialInference =
    delivery.version.composedPermits.commercialInference === true;

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-950">QA scorecard</p>
            <p className="mt-1 text-xs text-gray-500">
              {delivery.scorecard.id ?? "Attached scorecard pending"}
            </p>
          </div>
          <Pill className={statusClassName(delivery.scorecard.verdict)}>
            {sentenceCase(delivery.scorecard.verdict)}
          </Pill>
        </div>

        <div className="mt-5 flex items-end gap-3">
          <p className="text-5xl font-semibold tracking-tight text-gray-950">
            {formatPercent(delivery.scorecard.compositeScore)}
          </p>
          <p className="pb-2 text-sm text-gray-500">composite</p>
        </div>

        <div className="mt-5 space-y-3">
          {delivery.scorecard.dimensions.length > 0 ? (
            delivery.scorecard.dimensions.map((dimension) => (
              <ScoreBar
                key={dimension.key}
                label={dimension.label}
                value={dimension.score}
              />
            ))
          ) : (
            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
              Dimension evidence has not been attached to this delivery yet.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
        <p className="text-sm font-semibold text-gray-950">Trust evidence</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill className="border-gray-200 bg-gray-50 text-gray-700">
            Provenance: {shortHash(delivery.version.contentHash)}
          </Pill>
          <Pill
            className={
              delivery.privacy.state === "approved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            PII {sentenceCase(delivery.privacy.state)}
          </Pill>
          <Pill
            className={
              licenseTrain || commercialInference
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }
          >
            License:{" "}
            {licenseTrain || commercialInference
              ? "commercial AI"
              : "review required"}
          </Pill>
          <Pill className="border-gray-200 bg-gray-50 text-gray-700">
            Freshness: {formatDate(delivery.subscription.nextRefreshAt)}
          </Pill>
        </div>
      </section>

      <EvidenceGrid delivery={delivery} />
    </aside>
  );
}

function SubscriptionPanel({
  subscriptions,
}: {
  subscriptions: BuyerSubscription[];
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-950">
            Subscription operations
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Recurring datasets, refresh windows, contracts, and latest delta
            evidence.
          </p>
        </div>
        <Pill className="border-gray-200 bg-gray-50 text-gray-700">
          {formatNumber(subscriptions.length)} tracked
        </Pill>
      </div>

      <div className="mt-4 divide-y divide-gray-100">
        {subscriptions.length > 0 ? (
          subscriptions.map((subscription) => (
            <div
              key={subscription.id}
              className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-950">
                    {subscription.dataset.name}
                  </p>
                  <Pill className={statusClassName(subscription.state)}>
                    {sentenceCase(subscription.state)}
                  </Pill>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {subscription.currentVersion.label ?? "Version pending"} /{" "}
                  {sentenceCase(subscription.dataset.modality)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Cadence
                  </p>
                  <p className="mt-1 font-medium text-gray-800">
                    {sentenceCase(subscription.cadence)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Next refresh
                  </p>
                  <p className="mt-1 font-medium text-gray-800">
                    {formatDate(subscription.nextRefreshAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <Pill className="border-gray-200 bg-gray-50 text-gray-700">
                  {sentenceCase(subscription.deliveryChannel)}
                </Pill>
                <Pill
                  className={
                    subscription.latestDelta.rightsReverified
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  Rights{" "}
                  {subscription.latestDelta.rightsReverified
                    ? "verified"
                    : "pending"}
                </Pill>
                <Pill
                  className={
                    subscription.latestDelta.privacyVerified
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }
                >
                  Privacy{" "}
                  {subscription.latestDelta.privacyVerified
                    ? "verified"
                    : "pending"}
                </Pill>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No recurring subscription records are visible for this buyer yet.
          </p>
        )}
      </div>
    </section>
  );
}

function IntegrationPanel({
  integrations,
}: {
  integrations: BuyerIntegration[];
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">
            Delivery integrations
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Buyer-owned delivery destinations and verification state.
          </p>
        </div>
        <PlugZap className="h-4 w-4 text-emerald-600" />
      </div>

      <div className="mt-4 divide-y divide-gray-100">
        {integrations.length > 0 ? (
          integrations.map((integration) => (
            <div key={integration.id} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-950">
                    {integration.displayName}
                  </p>
                  <p className="mt-1 font-mono text-xs text-gray-500">
                    {metadataLabel(integration.metadata, "destination")}
                  </p>
                </div>
                <Pill className={statusClassName(integration.state)}>
                  {sentenceCase(integration.state)}
                </Pill>
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Provider
                  </p>
                  <p className="mt-1 font-medium text-gray-800">
                    {sentenceCase(integration.provider)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Auth
                  </p>
                  <p className="mt-1 font-medium text-gray-800">
                    {metadataLabel(integration.metadata, "authMode")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">
                    Verified
                  </p>
                  <p className="mt-1 font-medium text-gray-800">
                    {formatDate(integration.lastVerifiedAt)}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            Delivery integrations will appear after an operator connects a buyer
            destination.
          </p>
        )}
      </div>
    </section>
  );
}

function BillingPanel({
  invoices,
}: {
  invoices: BuyerInvoice[];
}) {
  const openAmount = invoices
    .filter((invoice) => ["draft", "open"].includes(invoice.state))
    .reduce((total, invoice) => total + invoice.amountCents, 0);
  const currency = invoices[0]?.currency ?? "USD";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-950">Billing</p>
          <p className="mt-1 text-sm text-gray-500">
            Operator-issued invoices and quote context for this buyer account.
          </p>
        </div>
        <Pill className="border-gray-200 bg-gray-50 text-gray-700">
          {formatMoney(openAmount, currency)} open
        </Pill>
      </div>

      <div className="mt-4 divide-y divide-gray-100">
        {invoices.length > 0 ? (
          invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs font-medium text-gray-500">
                    {invoice.id}
                  </p>
                  <Pill className={statusClassName(invoice.state)}>
                    {sentenceCase(invoice.state)}
                  </Pill>
                </div>
                <p className="mt-2 text-sm font-semibold text-gray-950">
                  {invoice.opportunity.title ?? "Buyer commercial record"}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Quote {metricLabel(invoice.quote.id)} / Updated{" "}
                  {formatDate(invoice.updatedAt)}
                </p>
              </div>
              <p className="text-right text-lg font-semibold tabular-nums text-gray-950">
                {formatMoney(invoice.amountCents, invoice.currency)}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">
            No buyer invoices are visible yet.
          </p>
        )}
      </div>
    </section>
  );
}

export function BuyerDeliveryWorkspace({ data }: BuyerDeliveryWorkspaceProps) {
  const primaryDelivery = data.deliveries[0] ?? null;

  return (
    <main className="min-h-screen bg-[var(--ds-canvas)] text-gray-950">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Pill className="border-emerald-200 bg-emerald-50 text-emerald-700">
                Buyer workspace v1
              </Pill>
              <Pill className="border-gray-200 bg-white text-gray-600">
                {data.authOrganization.name}
              </Pill>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
              Buyer Workspace
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {data.buyer.displayName} can review deliveries, subscriptions,
              integrations, billing, and trust evidence without changing operator
              records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="bg-white">
              <Link href="/contact">Support</Link>
            </Button>
            <Button asChild className="bg-gray-950 text-white hover:bg-gray-800">
              <Link href="/auth/sign-out">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            label="Deliveries"
            value={formatNumber(data.summary.deliveryCount)}
            icon={FileArchive}
          />
          <Metric
            label="Subscriptions"
            value={formatNumber(data.summary.activeSubscriptions)}
            icon={RefreshCw}
          />
          <Metric
            label="Quality"
            value={formatPercent(data.summary.averageQualityScore)}
            icon={Gauge}
          />
          <Metric
            label="Next refresh"
            value={formatDate(data.summary.nextRefreshAt)}
            icon={CalendarClock}
          />
          <Metric
            label="Open invoices"
            value={formatMoney(
              data.summary.openInvoiceAmountCents,
              data.invoices[0]?.currency ?? "USD",
            )}
            icon={CreditCard}
          />
          <Metric
            label="Integrations"
            value={formatNumber(data.summary.activeIntegrationCount)}
            icon={PlugZap}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.8fr)]">
          <SubscriptionPanel subscriptions={data.subscriptions} />
          <div className="grid gap-5">
            <IntegrationPanel integrations={data.integrations} />
            <BillingPanel invoices={data.invoices} />
          </div>
        </section>

        {primaryDelivery ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_28rem]">
            <div className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-950">
                    Deliveries
                  </p>
                  <p className="text-sm text-gray-500">
                    Latest delivery is expanded; all records are read-only.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Pill className="border-gray-200 bg-white text-gray-700">
                    <Database className="mr-1.5 h-3.5 w-3.5" />
                    {sentenceCase(primaryDelivery.dataset.modality)}
                  </Pill>
                  <Pill className="border-gray-200 bg-white text-gray-700">
                    <Scale className="mr-1.5 h-3.5 w-3.5" />
                    {primaryDelivery.version.label ?? "Version pending"}
                  </Pill>
                  <Pill className="border-gray-200 bg-white text-gray-700">
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    {primaryDelivery.delta.privacyVerified
                      ? "Privacy verified"
                      : "Privacy pending"}
                  </Pill>
                </div>
              </div>

              {data.deliveries.map((delivery) => (
                <DeliveryCard key={delivery.id} delivery={delivery} />
              ))}

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--ds-shadow-surface)]">
                <p className="text-sm font-semibold text-gray-950">
                  Delta manifest
                </p>
                <div className="mt-4 grid gap-px overflow-hidden rounded-xl border border-gray-100 bg-gray-100 sm:grid-cols-5">
                  {[
                    ["Added", primaryDelivery.delta.addedRecords],
                    ["Updated", primaryDelivery.delta.updatedRecords],
                    ["Deleted", primaryDelivery.delta.deletedRecords],
                    ["Tombstoned", primaryDelivery.delta.tombstonedRecords],
                    ["Total", primaryDelivery.delta.totalRecords],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-white p-3">
                      <p className="text-xs font-medium uppercase text-gray-400">
                        {label}
                      </p>
                      <p className="mt-1 text-lg font-semibold text-gray-950">
                        {formatNumber(Number(value))}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <ScorecardPanel delivery={primaryDelivery} />
          </section>
        ) : (
          <section className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-[var(--ds-shadow-surface)]">
            <p className="text-lg font-semibold text-gray-950">
              No buyer deliveries are ready yet.
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-500">
              Caudals operators will publish delivery and scorecard evidence here
              after the dataset package clears rights, privacy, and QA gates.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
