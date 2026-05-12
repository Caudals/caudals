import "server-only";

import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";
import {
  evaluateSamplePreviewGate,
  type SamplePreviewGateDecision,
} from "@/lib/operator/sample-preview-gating";

const DEFAULT_PUBLIC_CATALOGUE_ORG_ID = "or_01J20000000000000000000001";
const allowedModalities = new Set([
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "timeseries",
  "document",
]);
const allowedLicenseTiers = new Set([
  "standard",
  "evaluation",
  "enterprise",
  "exclusive",
]);

export type PublicCatalogueFilters = {
  query?: string;
  modality?: string;
  licenseTier?: string;
};

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type PublicCatalogueRow = {
  listingId: string;
  listingTitle: string;
  pricing: Record<string, unknown> | string | null;
  visibility: "public" | "partner" | "private";
  listingState: string;
  samplePreviewUri: string | null;
  samplePreviewPolicy: Record<string, unknown> | string | null;
  refreshCadence: string | null;
  licenseTier: string;
  updatedAt: string | Date;
  datasetId: string;
  datasetName: string;
  modality: string;
  versionId: string;
  versionLabel: string;
  manifestUri: string;
  contentHash: string;
  sizeBytes: number | string | null;
  recordCount: number | string | null;
  composedPermits: Record<string, unknown> | string | null;
  qaScore: number | string | null;
  releasedAt: string | Date | null;
  piiState: string | null;
  piiFindings: Record<string, unknown> | string | null;
  piiTreatments: Record<string, unknown> | string | null;
};

export type PublicCatalogueListing = {
  id: string;
  title: string;
  dataset: {
    id: string;
    name: string;
    modality: string;
  };
  version: {
    id: string;
    label: string;
    manifestUri: string;
    contentHash: string;
    sizeBytes: number | null;
    recordCount: number | null;
    releasedAt: string | null;
  };
  pricing: {
    priceCents: number | null;
    currency: string;
    billingModel: string | null;
  };
  licenseTier: string;
  refreshCadence: string | null;
  qualityScore: number | null;
  composedPermits: Record<string, unknown>;
  privacy: {
    state: string | null;
    findings: Record<string, unknown>;
    treatments: Record<string, unknown>;
  };
  samplePreview: {
    uri: string | null;
    decision: SamplePreviewGateDecision;
  };
  updatedAt: string;
};

export type PublicCatalogueData = {
  filters: Required<PublicCatalogueFilters>;
  listings: PublicCatalogueListing[];
  summary: {
    listingCount: number;
    modalities: string[];
    averageQualityScore: number | null;
    nextRefreshCadence: string | null;
  };
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function normalizePublicCatalogueFilters(
  filters: PublicCatalogueFilters,
): Required<PublicCatalogueFilters> {
  const query = filters.query?.trim().slice(0, 96) ?? "";
  const modality = filters.modality?.trim().toLowerCase() ?? "";
  const licenseTier = filters.licenseTier?.trim().toLowerCase() ?? "";

  return {
    query,
    modality: allowedModalities.has(modality) ? modality : "",
    licenseTier: allowedLicenseTiers.has(licenseTier) ? licenseTier : "",
  };
}

function getPublicCatalogueSession(): OperatorDbSession {
  return {
    orgId:
      process.env.CAUDALS_TENANT_ORG_ID ?? DEFAULT_PUBLIC_CATALOGUE_ORG_ID,
    serviceRole: true,
  };
}

function buildCatalogueQuery(filters: Required<PublicCatalogueFilters>) {
  const values: QueryValue[] = [];
  const where = [
    "cl.deleted_at IS NULL",
    "ds.deleted_at IS NULL",
    "dv.deleted_at IS NULL",
    "cl.state = 'active'",
    "cl.visibility = 'public'",
    "ds.state = 'active'",
    "dv.state = 'released'",
  ];

  if (filters.query) {
    values.push(`%${filters.query.toLowerCase()}%`);
    where.push(
      `(lower(cl.title) LIKE $${values.length} OR lower(ds.name) LIKE $${values.length})`,
    );
  }

  if (filters.modality) {
    values.push(filters.modality);
    where.push(`ds.modality = $${values.length}`);
  }

  if (filters.licenseTier) {
    values.push(filters.licenseTier);
    where.push(`cl.license_tier = $${values.length}`);
  }

  return {
    sql: `
      SELECT
        cl.id AS "listingId",
        cl.title AS "listingTitle",
        cl.pricing,
        cl.visibility,
        cl.state AS "listingState",
        cl.sample_preview_uri AS "samplePreviewUri",
        cl.sample_preview_policy AS "samplePreviewPolicy",
        cl.refresh_cadence AS "refreshCadence",
        cl.license_tier AS "licenseTier",
        cl.updated_at AS "updatedAt",
        ds.id AS "datasetId",
        ds.name AS "datasetName",
        ds.modality,
        dv.id AS "versionId",
        dv.version_label AS "versionLabel",
        dv.manifest_uri AS "manifestUri",
        dv.content_hash AS "contentHash",
        dv.size_bytes AS "sizeBytes",
        dv.record_count AS "recordCount",
        dv.composed_permits AS "composedPermits",
        dv.qa_score AS "qaScore",
        dv.released_at AS "releasedAt",
        pm.state AS "piiState",
        pm.findings AS "piiFindings",
        pm.treatments AS "piiTreatments"
      FROM catalogue_listing cl
      JOIN dataset ds ON ds.id = cl.dataset_id
      JOIN dataset_version dv ON dv.id = cl.dataset_version_id
      LEFT JOIN LATERAL (
        SELECT state, findings, treatments
        FROM pii_map
        WHERE dataset_version_id = dv.id
          AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ) pm ON true
      WHERE ${where.join("\n        AND ")}
      ORDER BY
        dv.released_at DESC NULLS LAST,
        cl.updated_at DESC,
        cl.title ASC
      LIMIT 24
    `,
    values,
  };
}

function mapCatalogueRow(row: PublicCatalogueRow): PublicCatalogueListing {
  const pricing = toRecord(row.pricing);
  const samplePreviewPolicy = toRecord(row.samplePreviewPolicy);
  const qaScore = toNumber(row.qaScore);

  return {
    id: row.listingId,
    title: row.listingTitle,
    dataset: {
      id: row.datasetId,
      name: row.datasetName,
      modality: row.modality,
    },
    version: {
      id: row.versionId,
      label: row.versionLabel,
      manifestUri: row.manifestUri,
      contentHash: row.contentHash,
      sizeBytes: toNumber(row.sizeBytes),
      recordCount: toNumber(row.recordCount),
      releasedAt: toIsoString(row.releasedAt),
    },
    pricing: {
      priceCents: toNumber(pricing.priceCents),
      currency: typeof pricing.currency === "string" ? pricing.currency : "USD",
      billingModel:
        typeof pricing.billingModel === "string" ? pricing.billingModel : null,
    },
    licenseTier: row.licenseTier,
    refreshCadence: row.refreshCadence,
    qualityScore: qaScore,
    composedPermits: toRecord(row.composedPermits),
    privacy: {
      state: row.piiState,
      findings: toRecord(row.piiFindings),
      treatments: toRecord(row.piiTreatments),
    },
    samplePreview: {
      uri: row.samplePreviewUri,
      decision: evaluateSamplePreviewGate({
        listingState: row.listingState,
        visibility: row.visibility,
        previewUri: row.samplePreviewUri,
        policy: samplePreviewPolicy,
      }),
    },
    updatedAt: toIsoString(row.updatedAt) ?? "",
  };
}

function summarizeListings(listings: PublicCatalogueListing[]) {
  const qualityScores = listings
    .map((listing) => listing.qualityScore)
    .filter((score): score is number => score !== null);
  const refreshCadences = listings
    .map((listing) => listing.refreshCadence)
    .filter((cadence): cadence is string => Boolean(cadence));

  return {
    listingCount: listings.length,
    modalities: Array.from(
      new Set(listings.map((listing) => listing.dataset.modality)),
    ).sort(),
    averageQualityScore:
      qualityScores.length > 0
        ? qualityScores.reduce((sum, score) => sum + score, 0) /
          qualityScores.length
        : null,
    nextRefreshCadence: refreshCadences[0] ?? null,
  };
}

export async function getPublicCatalogueData(
  filters: PublicCatalogueFilters,
  query: QueryRows = queryRows,
): Promise<PublicCatalogueData> {
  const normalizedFilters = normalizePublicCatalogueFilters(filters);
  const { sql, values } = buildCatalogueQuery(normalizedFilters);
  const rows = await query<PublicCatalogueRow>(
    sql,
    values,
    getPublicCatalogueSession(),
  );
  const listings = rows.map(mapCatalogueRow);

  return {
    filters: normalizedFilters,
    listings,
    summary: summarizeListings(listings),
  };
}
