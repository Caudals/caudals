import "server-only";

import * as Sentry from "@sentry/nextjs";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getBuyerWorkspaceData } from "@/lib/buyer/workspace";
import { getCurrentBuyerSession, type CurrentBuyerSession } from "@/lib/buyer/session";
import {
  queryRows,
  withOperatorDbSession,
  type DbQueryClient,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";
import { generatePrefixedUlid } from "@/lib/db/ids";
import { evaluateSamplePreviewGate } from "@/lib/operator/sample-preview-gating";
import { routePublicBuyerBriefIntake } from "@/lib/public/buyer-brief-intake";
import {
  buildRateLimitHeaders,
  consumeRateLimit,
  getClientIpFromHeaders,
} from "@/lib/security/rate-limit";
import {
  collaborationDatasetModalities,
  collaborationFormSchema,
  collaborationIndustries,
  collaborationTeamSizes,
} from "@/lib/validators/collaboration";

export const V1_API_VERSION = "2026-05-12";

const DEFAULT_PUBLIC_REST_ORG_ID = "or_01J20000000000000000000001";
const V1_DOC_PATH = "/v1";

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type V1RequestContext = {
  headers: Record<string, string>;
  clientIp: string;
};

type PublicDatasetRow = {
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
  documentationUri: string | null;
  documentationState: string | null;
  documentationValidation: Record<string, unknown> | string | null;
  hfMirror: Record<string, unknown> | string | null;
  piiState: string | null;
  piiFindings: Record<string, unknown> | string | null;
  piiTreatments: Record<string, unknown> | string | null;
};

type DatasetBriefRow = {
  id: string;
  title: string;
  state: string;
  requirements: Record<string, unknown> | string | null;
  sensitivityConstraints: Record<string, unknown> | string | null;
  targetFormats: string[] | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  buyerOpportunityId: string | null;
  buyerOpportunityTitle: string | null;
  buyerOpportunityState: string | null;
  contactEmail: string | null;
};

type DeliveryRow = {
  id: string;
  state: string;
  channel: string;
  receipt: Record<string, unknown> | string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  datasetId: string | null;
  datasetName: string | null;
  modality: string | null;
  datasetVersionId: string | null;
  versionLabel: string | null;
  manifestUri: string | null;
  contentHash: string | null;
  recordCount: number | string | null;
  qaScore: number | string | null;
  releasedAt: string | Date | null;
  subscriptionId: string | null;
};

type SubscriptionRow = {
  id: string;
  state: string;
  cadence: string;
  deliveryChannel: string;
  nextRefreshAt: string | Date | null;
  rollingWindowVersions: number | string | null;
  retentionPolicy: Record<string, unknown> | string | null;
  deliveryPolicy: Record<string, unknown> | string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  datasetId: string | null;
  datasetName: string | null;
  modality: string | null;
  currentVersionId: string | null;
  currentVersionLabel: string | null;
  currentVersionRecords: number | string | null;
  currentVersionQaScore: number | string | null;
  currentVersionReleasedAt: string | Date | null;
  latestDeltaId: string | null;
  latestDeltaState: string | null;
  latestDeltaRecords: number | string | null;
  latestDeltaQualityScore: number | string | null;
  latestDeltaPublishedAt: string | Date | null;
};

type DeltaManifestRow = {
  id: string;
  state: string;
  manifestUri: string | null;
  manifestHash: string | null;
  addedRecords: number | string | null;
  updatedRecords: number | string | null;
  deletedRecords: number | string | null;
  tombstonedRecords: number | string | null;
  totalRecords: number | string | null;
  qualityScore: number | string | null;
  rightsReverified: boolean | null;
  privacyVerified: boolean | null;
  publishedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type QuoteRow = {
  id: string;
  state: string;
  amountCents: number | string;
  currency: string;
};

const idSchemas = {
  dataset: z.string().regex(/^dt_[0-9A-HJKMNP-TV-Z]{10,}$/),
  version: z.string().regex(/^dv_[0-9A-HJKMNP-TV-Z]{10,}$/),
  brief: z.string().regex(/^br_[0-9A-HJKMNP-TV-Z]{10,}$/),
  delivery: z.string().regex(/^dl_[0-9A-HJKMNP-TV-Z]{10,}$/),
  subscription: z.string().regex(/^su_[0-9A-HJKMNP-TV-Z]{10,}$/),
};

const optionalTextField = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : undefined))
    .optional();

const v1WebsiteSchema = z
  .string()
  .trim()
  .max(240)
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => {
      if (!value) return true;
      try {
        const url = new URL(value.startsWith("http") ? value : `https://${value}`);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Invalid organization website" },
  )
  .transform((value) => {
    if (!value) return undefined;
    return value.startsWith("http") ? value : `https://${value}`;
  })
  .optional();

const v1AccessRequestSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  workEmail: z.string().trim().email().max(320),
  organization: z.string().trim().min(2).max(160),
  organizationWebsite: v1WebsiteSchema,
  industry: z.enum(collaborationIndustries).optional(),
  teamSize: z.enum(collaborationTeamSizes).optional(),
  budgetRange: optionalTextField(160),
  timeline: optionalTextField(160),
  targetFormats: optionalTextField(240),
  sensitivityConstraints: optionalTextField(500),
  message: z.string().trim().min(20).max(2000),
  geography: optionalTextField(160),
  freshness: optionalTextField(160),
  volume: optionalTextField(160),
});

const v1BriefBodySchema = z
  .record(z.string(), z.unknown())
  .transform((value) => ({
    focusArea: "custom-dataset",
    ...value,
  }))
  .pipe(collaborationFormSchema)
  .refine(
    (value) =>
      value.focusArea === "buy-dataset" ||
      value.focusArea === "custom-dataset",
    {
      message: "Brief focusArea must be buy-dataset or custom-dataset",
      path: ["focusArea"],
    },
  );

const inferredModalitySchema = z.enum(collaborationDatasetModalities);

const disputeSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

const approveQuoteSchema = z.object({
  quoteId: z
    .string()
    .regex(/^qt_[0-9A-HJKMNP-TV-Z]{10,}$/)
    .optional(),
});

const tracer = trace.getTracer("caudals.public_rest_v1");

type V1EndpointDoc = {
  method: "GET" | "POST";
  path: string;
  auth: "none" | "buyer session";
  description: string;
};

const v1DescriptorEndpointDoc: V1EndpointDoc = {
  method: "GET",
  path: "/v1",
  auth: "none",
  description: "Inline service descriptor for the versioned Caudals REST API.",
};

const v1CatalogueEndpointDocs: V1EndpointDoc[] = [
  {
    method: "GET",
    path: "/v1/datasets",
    auth: "none",
    description: "List public catalogue datasets.",
  },
  {
    method: "GET",
    path: "/v1/datasets/{id}",
    auth: "none",
    description: "Read a public dataset family and its latest listed version.",
  },
  {
    method: "GET",
    path: "/v1/datasets/{id}/versions",
    auth: "none",
    description: "List released public versions for a dataset.",
  },
  {
    method: "GET",
    path: "/v1/datasets/{id}/versions/{versionId}",
    auth: "none",
    description: "Read a specific public dataset version.",
  },
  {
    method: "GET",
    path: "/v1/datasets/{id}/versions/{versionId}/sample",
    auth: "none",
    description: "Return the public sample preview URI when the preview gate allows it.",
  },
  {
    method: "POST",
    path: "/v1/datasets/{id}/versions/{versionId}/access",
    auth: "none",
    description: "Request access to a listed dataset version and route it to operator intake.",
  },
];

const v1CoreEndpointDocs: V1EndpointDoc[] = [
  {
    method: "POST",
    path: "/v1/briefs",
    auth: "none",
    description: "Submit a custom dataset brief into operator intake.",
  },
  {
    method: "GET",
    path: "/v1/briefs/{id}",
    auth: "buyer session",
    description: "Read brief progress for the authenticated buyer contact.",
  },
  {
    method: "POST",
    path: "/v1/briefs/{id}/approve_quote",
    auth: "buyer session",
    description: "Accept the latest sent quote attached to a buyer brief.",
  },
  {
    method: "GET",
    path: "/v1/deliveries",
    auth: "buyer session",
    description: "List authenticated buyer deliveries.",
  },
  {
    method: "GET",
    path: "/v1/deliveries/{id}",
    auth: "buyer session",
    description: "Read a buyer delivery receipt and dataset version summary.",
  },
  {
    method: "POST",
    path: "/v1/deliveries/{id}/accept",
    auth: "buyer session",
    description: "Accept a ready, sent, or downloaded delivery and audit the transition.",
  },
  {
    method: "POST",
    path: "/v1/deliveries/{id}/dispute",
    auth: "buyer session",
    description: "Dispute a buyer delivery and audit the transition.",
  },
  {
    method: "GET",
    path: "/v1/subscriptions",
    auth: "buyer session",
    description: "List authenticated buyer subscriptions.",
  },
  {
    method: "GET",
    path: "/v1/subscriptions/{id}/refreshes",
    auth: "buyer session",
    description: "List refresh delta manifests for a subscription.",
  },
  {
    method: "POST",
    path: "/v1/subscriptions/{id}/pause",
    auth: "buyer session",
    description: "Pause an active or refreshing buyer subscription and audit the transition.",
  },
];

export function isPublicRestV1Enabled(env: NodeJS.ProcessEnv = process.env) {
  return env.PUBLIC_REST_V1_ENABLED !== "false";
}

export function isPublicRestCatalogueEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.PUBLIC_REST_CATALOGUE_ENABLED === "true";
}

export function getV1EndpointDocs(env: NodeJS.ProcessEnv = process.env) {
  return [
    v1DescriptorEndpointDoc,
    ...(isPublicRestCatalogueEnabled(env) ? v1CatalogueEndpointDocs : []),
    ...v1CoreEndpointDocs,
  ];
}

export const v1EndpointDocs = getV1EndpointDocs();

export function canAcceptDeliveryState(state: string) {
  return ["ready", "sent", "downloaded"].includes(state);
}

export function canDisputeDeliveryState(state: string) {
  return ["ready", "sent", "downloaded", "accepted"].includes(state);
}

export function canPauseSubscriptionState(state: string) {
  return ["active", "refreshing"].includes(state);
}

function publicRestOrgId(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.PUBLIC_REST_V1_TENANT_ORG_ID ??
    env.PUBLIC_BUYER_BRIEF_TENANT_ORG_ID ??
    env.CAUDALS_TENANT_ORG_ID ??
    DEFAULT_PUBLIC_REST_ORG_ID
  );
}

function publicRestSession() {
  return {
    orgId: publicRestOrgId(),
    serviceRole: true,
  };
}

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

function toInteger(value: unknown, fallback = 0): number {
  const numeric = toNumber(value);
  return numeric === null ? fallback : Math.trunc(numeric);
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

function withHeaders(headers: Record<string, string>) {
  return {
    ...headers,
    "Caudals-API-Version": V1_API_VERSION,
    "Cache-Control": "no-store",
    Link: `<${V1_DOC_PATH}>; rel="service-desc"`,
  };
}

function v1Json(
  data: unknown,
  context: V1RequestContext,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return NextResponse.json(
    {
      apiVersion: V1_API_VERSION,
      data,
    },
    {
      status: init.status ?? 200,
      headers: withHeaders({ ...context.headers, ...init.headers }),
    },
  );
}

function v1Error(
  context: V1RequestContext,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    {
      apiVersion: V1_API_VERSION,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    {
      status,
      headers: withHeaders(context.headers),
    },
  );
}

async function prepareV1Request(
  request: NextRequest,
  scope: string,
  mode: "read" | "write",
): Promise<V1RequestContext | NextResponse> {
  const clientIp = getClientIpFromHeaders(request.headers);
  const context = {
    clientIp,
    headers: {},
  };

  if (!isPublicRestV1Enabled()) {
    return v1Error(context, 404, "api_disabled", "The v1 API is not enabled.");
  }

  const limit = mode === "read" ? 120 : 30;
  const windowMs = mode === "read" ? 15 * 60 * 1000 : 60 * 60 * 1000;
  const rateLimit = await consumeRateLimit({
    key: `v1:${scope}:${clientIp}`,
    limit,
    windowMs,
  });
  const rateHeaders = buildRateLimitHeaders(rateLimit);
  const rateContext = {
    clientIp,
    headers: rateHeaders,
  };

  if (!rateLimit.allowed) {
    return v1Error(
      rateContext,
      429,
      "rate_limited",
      "Too many requests. Please try again later.",
    );
  }

  return rateContext;
}

function v1CatalogueDeferred(context: V1RequestContext) {
  return v1Error(
    context,
    404,
    "catalogue_deferred",
    "Public catalogue dataset endpoints are deferred for this deployment.",
  );
}

async function prepareV1CatalogueRequest(
  request: NextRequest,
  scope: string,
  mode: "read" | "write",
): Promise<V1RequestContext | NextResponse> {
  const context = await prepareV1Request(request, scope, mode);
  if (context instanceof NextResponse) return context;

  if (!isPublicRestCatalogueEnabled()) {
    return v1CatalogueDeferred(context);
  }

  return context;
}

async function readJsonBody(request: NextRequest) {
  return request.json().catch(() => null);
}

async function withV1Span<T>(
  name: string,
  attributes: Record<string, string | number | boolean | null | undefined>,
  callback: () => Promise<T>,
) {
  return tracer.startActiveSpan(name, async (span) => {
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    });

    try {
      const result = await callback();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "v1 API failure",
      });
      Sentry.captureException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

function parseId<T extends keyof typeof idSchemas>(
  context: V1RequestContext,
  type: T,
  value: string,
) {
  const parsed = idSchemas[type].safeParse(value);

  if (!parsed.success) {
    return {
      ok: false as const,
      response: v1Error(
        context,
        400,
        "invalid_id",
        `Invalid ${type} identifier.`,
      ),
    };
  }

  return { ok: true as const, value: parsed.data };
}

function datasetFieldsSql() {
  return `
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
      rd.documentation_uri AS "documentationUri",
      rd.state AS "documentationState",
      rd.validation_summary AS "documentationValidation",
      rd.hf_mirror AS "hfMirror",
      pm.state AS "piiState",
      pm.findings AS "piiFindings",
      pm.treatments AS "piiTreatments"
    FROM catalogue_listing cl
    JOIN dataset ds ON ds.id = cl.dataset_id
    JOIN dataset_version dv ON dv.id = cl.dataset_version_id
    LEFT JOIN release_documentation_bundle rd
      ON rd.dataset_version_id = dv.id
      AND rd.deleted_at IS NULL
      AND rd.state IN ('approved','published')
    LEFT JOIN LATERAL (
      SELECT state, findings, treatments
      FROM pii_map
      WHERE dataset_version_id = dv.id
        AND deleted_at IS NULL
      ORDER BY
        CASE WHEN state = 'approved' THEN 0 ELSE 1 END,
        updated_at DESC
      LIMIT 1
    ) pm ON true
  `;
}

function publicDatasetWhereSql(extra: string[] = []) {
  return [
    "cl.deleted_at IS NULL",
    "ds.deleted_at IS NULL",
    "dv.deleted_at IS NULL",
    "cl.state = 'active'",
    "cl.visibility = 'public'",
    "ds.state = 'active'",
    "dv.state = 'released'",
    ...extra,
  ].join("\n      AND ");
}

function mapPublicDataset(row: PublicDatasetRow) {
  const pricing = toRecord(row.pricing);
  const samplePreviewPolicy = toRecord(row.samplePreviewPolicy);
  const samplePreview = evaluateSamplePreviewGate({
    listingState: row.listingState,
    visibility: row.visibility,
    previewUri: row.samplePreviewUri,
    policy: samplePreviewPolicy,
  });

  return {
    id: row.datasetId,
    name: row.datasetName,
    modality: row.modality,
    listing: {
      id: row.listingId,
      title: row.listingTitle,
      licenseTier: row.licenseTier,
      refreshCadence: row.refreshCadence,
      pricing: {
        priceCents: toNumber(pricing.priceCents),
        currency: typeof pricing.currency === "string" ? pricing.currency : "USD",
        billingModel:
          typeof pricing.billingModel === "string" ? pricing.billingModel : null,
      },
      updatedAt: toIsoString(row.updatedAt),
    },
    currentVersion: mapPublicDatasetVersion(row),
    samplePreview: {
      available: samplePreview.allowed,
      reason: samplePreview.reason,
      watermark: samplePreview.watermark,
    },
  };
}

function mapPublicDatasetVersion(row: PublicDatasetRow) {
  return {
    id: row.versionId,
    datasetId: row.datasetId,
    label: row.versionLabel,
    manifestUri: row.manifestUri,
    contentHash: row.contentHash,
    sizeBytes: toNumber(row.sizeBytes),
    recordCount: toNumber(row.recordCount),
    releasedAt: toIsoString(row.releasedAt),
    qualityScore: toNumber(row.qaScore),
    composedPermits: toRecord(row.composedPermits),
    releaseDocumentation: {
      uri: row.documentationUri,
      state: row.documentationState,
      validation: toRecord(row.documentationValidation),
      hfMirror: toRecord(row.hfMirror),
    },
    privacy: {
      state: row.piiState,
      findings: toRecord(row.piiFindings),
      treatments: toRecord(row.piiTreatments),
    },
  };
}

async function listPublicDatasets(request: NextRequest, query: QueryRows = queryRows) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("query")?.trim().slice(0, 96) ?? "";
  const modality = searchParams.get("modality")?.trim().toLowerCase() ?? "";
  const values: QueryValue[] = [];
  const where = [publicDatasetWhereSql()];

  if (search) {
    values.push(`%${search.toLowerCase()}%`);
    where.push(
      `(lower(cl.title) LIKE $${values.length} OR lower(ds.name) LIKE $${values.length})`,
    );
  }

  if (modality) {
    values.push(modality);
    where.push(`ds.modality = $${values.length}`);
  }

  const rows = await query<PublicDatasetRow>(
    `
      ${datasetFieldsSql()}
      WHERE ${where.join("\n      AND ")}
      ORDER BY dv.released_at DESC NULLS LAST, cl.updated_at DESC, cl.title ASC
      LIMIT 50
    `,
    values,
    publicRestSession(),
  );
  const datasets = rows.map(mapPublicDataset);

  return {
    datasets,
    count: datasets.length,
    filters: { query: search, modality },
  };
}

async function getPublicDataset(
  datasetId: string,
  query: QueryRows = queryRows,
) {
  const rows = await query<PublicDatasetRow>(
    `
      ${datasetFieldsSql()}
      WHERE ${publicDatasetWhereSql(["ds.id = $1"])}
      ORDER BY dv.released_at DESC NULLS LAST, cl.updated_at DESC
      LIMIT 1
    `,
    [datasetId],
    publicRestSession(),
  );

  return rows[0] ? mapPublicDataset(rows[0]) : null;
}

async function listPublicDatasetVersions(
  datasetId: string,
  query: QueryRows = queryRows,
) {
  const rows = await query<PublicDatasetRow>(
    `
      ${datasetFieldsSql()}
      WHERE ${publicDatasetWhereSql(["ds.id = $1"])}
      ORDER BY dv.released_at DESC NULLS LAST, dv.version_label DESC
      LIMIT 50
    `,
    [datasetId],
    publicRestSession(),
  );

  return rows.map(mapPublicDatasetVersion);
}

async function getPublicDatasetVersionRow(
  datasetId: string,
  versionId: string,
  query: QueryRows = queryRows,
) {
  const rows = await query<PublicDatasetRow>(
    `
      ${datasetFieldsSql()}
      WHERE ${publicDatasetWhereSql(["ds.id = $1", "dv.id = $2"])}
      LIMIT 1
    `,
    [datasetId, versionId],
    publicRestSession(),
  );

  return rows[0] ?? null;
}

function mapDatasetBrief(row: DatasetBriefRow) {
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    requirements: toRecord(row.requirements),
    sensitivityConstraints: toRecord(row.sensitivityConstraints),
    targetFormats: row.targetFormats ?? [],
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    opportunity: {
      id: row.buyerOpportunityId,
      title: row.buyerOpportunityTitle,
      state: row.buyerOpportunityState,
    },
  };
}

async function getBriefForBuyer(
  briefId: string,
  session: CurrentBuyerSession,
  query: QueryRows = queryRows,
) {
  const rows = await query<DatasetBriefRow>(
    `
      SELECT
        br.id,
        br.title,
        br.state,
        br.requirements,
        br.sensitivity_constraints AS "sensitivityConstraints",
        br.target_formats AS "targetFormats",
        br.created_at AS "createdAt",
        br.updated_at AS "updatedAt",
        bo.id AS "buyerOpportunityId",
        bo.title AS "buyerOpportunityTitle",
        bo.state AS "buyerOpportunityState",
        co.email AS "contactEmail"
      FROM dataset_brief br
      LEFT JOIN buyer_opportunity bo ON bo.id = br.buyer_opportunity_id
      LEFT JOIN contact co ON co.id = bo.contact_id
      WHERE br.id = $1
        AND br.org_id = $2
        AND br.deleted_at IS NULL
        AND (lower(co.email::text) = lower($3) OR co.email IS NULL)
      LIMIT 1
    `,
    [briefId, session.tenantOrgId, session.authUser.email],
    { orgId: session.tenantOrgId },
  );

  return rows[0] ? mapDatasetBrief(rows[0]) : null;
}

function mapDelivery(row: DeliveryRow) {
  return {
    id: row.id,
    state: row.state,
    channel: row.channel,
    receipt: toRecord(row.receipt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    subscriptionId: row.subscriptionId,
    dataset: {
      id: row.datasetId,
      name: row.datasetName,
      modality: row.modality,
    },
    version: {
      id: row.datasetVersionId,
      label: row.versionLabel,
      manifestUri: row.manifestUri,
      contentHash: row.contentHash,
      recordCount: toNumber(row.recordCount),
      qaScore: toNumber(row.qaScore),
      releasedAt: toIsoString(row.releasedAt),
    },
  };
}

async function queryBuyerDeliveries(
  session: CurrentBuyerSession,
  deliveryId?: string,
  query: QueryRows = queryRows,
) {
  const values: QueryValue[] = [session.buyer.id];
  const where = ["dl.buyer_org_id = $1", "dl.deleted_at IS NULL"];

  if (deliveryId) {
    values.push(deliveryId);
    where.push(`dl.id = $${values.length}`);
  }

  const rows = await query<DeliveryRow>(
    `
      SELECT
        dl.id,
        dl.state,
        dl.channel,
        dl.receipt,
        dl.created_at AS "createdAt",
        dl.updated_at AS "updatedAt",
        ds.id AS "datasetId",
        ds.name AS "datasetName",
        ds.modality,
        dv.id AS "datasetVersionId",
        dv.version_label AS "versionLabel",
        dv.manifest_uri AS "manifestUri",
        dv.content_hash AS "contentHash",
        dv.record_count AS "recordCount",
        dv.qa_score AS "qaScore",
        dv.released_at AS "releasedAt",
        dl.subscription_id AS "subscriptionId"
      FROM delivery dl
      LEFT JOIN dataset_version dv ON dv.id = dl.dataset_version_id AND dv.deleted_at IS NULL
      LEFT JOIN dataset ds ON ds.id = dv.dataset_id AND ds.deleted_at IS NULL
      WHERE ${where.join("\n        AND ")}
      ORDER BY dl.updated_at DESC
      LIMIT ${deliveryId ? 1 : 50}
    `,
    values,
    { orgId: session.tenantOrgId },
  );

  return rows.map(mapDelivery);
}

function mapSubscription(row: SubscriptionRow) {
  return {
    id: row.id,
    state: row.state,
    cadence: row.cadence,
    deliveryChannel: row.deliveryChannel,
    nextRefreshAt: toIsoString(row.nextRefreshAt),
    rollingWindowVersions: toInteger(row.rollingWindowVersions),
    retentionPolicy: toRecord(row.retentionPolicy),
    deliveryPolicy: toRecord(row.deliveryPolicy),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
    dataset: {
      id: row.datasetId,
      name: row.datasetName,
      modality: row.modality,
    },
    currentVersion: {
      id: row.currentVersionId,
      label: row.currentVersionLabel,
      recordCount: toNumber(row.currentVersionRecords),
      qaScore: toNumber(row.currentVersionQaScore),
      releasedAt: toIsoString(row.currentVersionReleasedAt),
    },
    latestDelta: {
      id: row.latestDeltaId,
      state: row.latestDeltaState,
      totalRecords: toInteger(row.latestDeltaRecords),
      qualityScore: toNumber(row.latestDeltaQualityScore),
      publishedAt: toIsoString(row.latestDeltaPublishedAt),
    },
  };
}

async function queryBuyerSubscriptions(
  session: CurrentBuyerSession,
  subscriptionId?: string,
  query: QueryRows = queryRows,
) {
  const values: QueryValue[] = [session.buyer.id];
  const where = ["su.buyer_org_id = $1", "su.deleted_at IS NULL"];

  if (subscriptionId) {
    values.push(subscriptionId);
    where.push(`su.id = $${values.length}`);
  }

  const rows = await query<SubscriptionRow>(
    `
      SELECT
        su.id,
        su.state,
        su.cadence,
        su.delivery_channel AS "deliveryChannel",
        su.next_refresh_at AS "nextRefreshAt",
        su.rolling_window_versions AS "rollingWindowVersions",
        su.retention_policy AS "retentionPolicy",
        su.delivery_policy AS "deliveryPolicy",
        su.created_at AS "createdAt",
        su.updated_at AS "updatedAt",
        ds.id AS "datasetId",
        ds.name AS "datasetName",
        ds.modality,
        dv.id AS "currentVersionId",
        dv.version_label AS "currentVersionLabel",
        dv.record_count AS "currentVersionRecords",
        dv.qa_score AS "currentVersionQaScore",
        dv.released_at AS "currentVersionReleasedAt",
        dm.id AS "latestDeltaId",
        dm.state AS "latestDeltaState",
        dm.total_records AS "latestDeltaRecords",
        dm.quality_score AS "latestDeltaQualityScore",
        dm.published_at AS "latestDeltaPublishedAt"
      FROM subscription su
      LEFT JOIN dataset ds ON ds.id = su.dataset_id AND ds.deleted_at IS NULL
      LEFT JOIN dataset_version dv
        ON dv.id = su.current_dataset_version_id AND dv.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT *
        FROM delta_manifest dm
        WHERE dm.subscription_id = su.id
          AND dm.deleted_at IS NULL
        ORDER BY dm.updated_at DESC
        LIMIT 1
      ) dm ON true
      WHERE ${where.join("\n        AND ")}
      ORDER BY
        CASE
          WHEN su.state IN ('active','refreshing') THEN 0
          WHEN su.state = 'paused' THEN 1
          ELSE 2
        END,
        su.next_refresh_at NULLS LAST,
        su.updated_at DESC
      LIMIT ${subscriptionId ? 1 : 50}
    `,
    values,
    { orgId: session.tenantOrgId },
  );

  return rows.map(mapSubscription);
}

function mapDeltaManifest(row: DeltaManifestRow) {
  return {
    id: row.id,
    state: row.state,
    manifestUri: row.manifestUri,
    manifestHash: row.manifestHash,
    addedRecords: toInteger(row.addedRecords),
    updatedRecords: toInteger(row.updatedRecords),
    deletedRecords: toInteger(row.deletedRecords),
    tombstonedRecords: toInteger(row.tombstonedRecords),
    totalRecords: toInteger(row.totalRecords),
    qualityScore: toNumber(row.qualityScore),
    rightsReverified: Boolean(row.rightsReverified),
    privacyVerified: Boolean(row.privacyVerified),
    publishedAt: toIsoString(row.publishedAt),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

async function querySubscriptionRefreshes(
  session: CurrentBuyerSession,
  subscriptionId: string,
  query: QueryRows = queryRows,
) {
  const rows = await query<DeltaManifestRow>(
    `
      SELECT
        dm.id,
        dm.state,
        dm.manifest_uri AS "manifestUri",
        dm.manifest_hash AS "manifestHash",
        dm.added_records AS "addedRecords",
        dm.updated_records AS "updatedRecords",
        dm.deleted_records AS "deletedRecords",
        dm.tombstoned_records AS "tombstonedRecords",
        dm.total_records AS "totalRecords",
        dm.quality_score AS "qualityScore",
        dm.rights_reverified AS "rightsReverified",
        dm.privacy_verified AS "privacyVerified",
        dm.published_at AS "publishedAt",
        dm.created_at AS "createdAt",
        dm.updated_at AS "updatedAt"
      FROM delta_manifest dm
      JOIN subscription su ON su.id = dm.subscription_id
      WHERE dm.subscription_id = $1
        AND su.buyer_org_id = $2
        AND dm.deleted_at IS NULL
        AND su.deleted_at IS NULL
      ORDER BY dm.updated_at DESC
      LIMIT 50
    `,
    [subscriptionId, session.buyer.id],
    { orgId: session.tenantOrgId },
  );

  return rows.map(mapDeltaManifest);
}

async function requireBuyerSession(
  context: V1RequestContext,
  request: NextRequest,
) {
  const lookup = await getCurrentBuyerSession(request.headers);

  if (lookup.status === "unauthenticated") {
    return {
      ok: false as const,
      response: v1Error(
        context,
        401,
        "unauthenticated",
        "A buyer session is required.",
      ),
    };
  }

  if (lookup.status === "unauthorized") {
    return {
      ok: false as const,
      response: v1Error(
        context,
        403,
        "unauthorized",
        "The current user is not authorized for the buyer API.",
      ),
    };
  }

  return { ok: true as const, session: lookup.session };
}

async function auditTransition(
  client: DbQueryClient,
  session: CurrentBuyerSession,
  targetType: string,
  targetId: string,
  fromState: string,
  toState: string,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    `
      INSERT INTO audit_event (
        id, org_id, action, target_type, target_id, metadata, created_by
      )
      VALUES ($1, $2, 'state_transition', $3, $4, $5::jsonb, NULL)
    `,
    [
      generatePrefixedUlid("ae"),
      session.tenantOrgId,
      targetType,
      targetId,
      JSON.stringify({
        from_state: fromState,
        to_state: toState,
        actor: session.authUser.email,
        source: "public_rest_v1",
        ...metadata,
      }),
    ],
  );
}

async function transitionDelivery(
  session: CurrentBuyerSession,
  deliveryId: string,
  toState: "accepted" | "disputed",
  metadata: Record<string, unknown> = {},
) {
  return withOperatorDbSession(
    { orgId: session.tenantOrgId },
    async (client) => {
      const rows = await client.query<DeliveryRow>(
        `
          SELECT
            id,
            state,
            channel,
            receipt,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            NULL::text AS "datasetId",
            NULL::text AS "datasetName",
            NULL::text AS modality,
            dataset_version_id AS "datasetVersionId",
            NULL::text AS "versionLabel",
            NULL::text AS "manifestUri",
            NULL::text AS "contentHash",
            NULL::bigint AS "recordCount",
            NULL::numeric AS "qaScore",
            NULL::timestamptz AS "releasedAt",
            subscription_id AS "subscriptionId"
          FROM delivery
          WHERE id = $1
            AND buyer_org_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [deliveryId, session.buyer.id],
      );
      const current = rows.rows[0];

      if (!current) {
        return { status: "missing" as const };
      }

      const allowed =
        toState === "accepted"
          ? canAcceptDeliveryState(current.state)
          : canDisputeDeliveryState(current.state);

      if (!allowed) {
        return { status: "blocked" as const, state: current.state };
      }

      const timestamp = new Date().toISOString();
      const receiptPatch =
        toState === "accepted"
          ? {
              acceptedAt: timestamp,
              acceptedBy: session.authUser.email,
            }
          : {
              disputedAt: timestamp,
              disputedBy: session.authUser.email,
              disputeReason: metadata.reason,
            };
      const updated = await client.query<DeliveryRow>(
        `
          UPDATE delivery
          SET
            state = $3,
            receipt = receipt || $4::jsonb,
            updated_at = $5
          WHERE id = $1
            AND buyer_org_id = $2
            AND deleted_at IS NULL
          RETURNING
            id,
            state,
            channel,
            receipt,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            NULL::text AS "datasetId",
            NULL::text AS "datasetName",
            NULL::text AS modality,
            dataset_version_id AS "datasetVersionId",
            NULL::text AS "versionLabel",
            NULL::text AS "manifestUri",
            NULL::text AS "contentHash",
            NULL::bigint AS "recordCount",
            NULL::numeric AS "qaScore",
            NULL::timestamptz AS "releasedAt",
            subscription_id AS "subscriptionId"
        `,
        [
          deliveryId,
          session.buyer.id,
          toState,
          JSON.stringify(receiptPatch),
          timestamp,
        ],
      );

      await auditTransition(
        client,
        session,
        "delivery",
        deliveryId,
        current.state,
        toState,
        metadata,
      );

      return {
        status: "updated" as const,
        delivery: mapDelivery(updated.rows[0]),
      };
    },
  );
}

async function pauseSubscription(
  session: CurrentBuyerSession,
  subscriptionId: string,
) {
  return withOperatorDbSession(
    { orgId: session.tenantOrgId },
    async (client) => {
      const currentRows = await client.query<{ id: string; state: string }>(
        `
          SELECT id, state
          FROM subscription
          WHERE id = $1
            AND buyer_org_id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [subscriptionId, session.buyer.id],
      );
      const current = currentRows.rows[0];

      if (!current) {
        return { status: "missing" as const };
      }

      if (!canPauseSubscriptionState(current.state)) {
        return { status: "blocked" as const, state: current.state };
      }

      await client.query(
        `
          UPDATE subscription
          SET state = 'paused', updated_at = now()
          WHERE id = $1
            AND buyer_org_id = $2
            AND deleted_at IS NULL
        `,
        [subscriptionId, session.buyer.id],
      );

      await auditTransition(
        client,
        session,
        "subscription",
        subscriptionId,
        current.state,
        "paused",
      );

      return { status: "updated" as const };
    },
  );
}

async function approveBriefQuote(
  session: CurrentBuyerSession,
  briefId: string,
  quoteId?: string,
) {
  return withOperatorDbSession(
    { orgId: session.tenantOrgId },
    async (client) => {
      const quoteRows = await client.query<QuoteRow>(
        `
          SELECT
            qt.id,
            qt.state,
            qt.amount_cents AS "amountCents",
            qt.currency
          FROM quote qt
          JOIN buyer_opportunity bo ON bo.id = qt.buyer_opportunity_id
          JOIN dataset_brief br ON br.buyer_opportunity_id = bo.id
          LEFT JOIN contact co ON co.id = bo.contact_id
          WHERE br.id = $1
            AND br.org_id = $2
            AND qt.deleted_at IS NULL
            AND br.deleted_at IS NULL
            AND (qt.buyer_org_id = $3 OR lower(co.email::text) = lower($4))
            AND ($5::text IS NULL OR qt.id = $5)
          ORDER BY
            CASE WHEN qt.state = 'sent' THEN 0 ELSE 1 END,
            qt.updated_at DESC
          LIMIT 1
        `,
        [
          briefId,
          session.tenantOrgId,
          session.buyer.id,
          session.authUser.email,
          quoteId ?? null,
        ],
      );
      const quote = quoteRows.rows[0];

      if (!quote) {
        return { status: "missing" as const };
      }

      if (quote.state !== "sent") {
        return { status: "blocked" as const, state: quote.state };
      }

      await client.query(
        `
          UPDATE quote
          SET state = 'accepted', updated_at = now()
          WHERE id = $1
            AND deleted_at IS NULL
        `,
        [quote.id],
      );

      await auditTransition(
        client,
        session,
        "quote",
        quote.id,
        "sent",
        "accepted",
        { dataset_brief_id: briefId },
      );

      return {
        status: "updated" as const,
        quote: {
          id: quote.id,
          state: "accepted",
          amountCents: toInteger(quote.amountCents),
          currency: quote.currency,
        },
      };
    },
  );
}

export async function handleV1Docs(request: NextRequest) {
  const context = await prepareV1Request(request, "docs", "read");
  if (context instanceof NextResponse) return context;
  const catalogueEnabled = isPublicRestCatalogueEnabled();

  return v1Json(
    {
      name: "Caudals REST API",
      version: V1_API_VERSION,
      authentication: catalogueEnabled
        ? "Public catalogue and intake endpoints are anonymous. Buyer delivery, subscription, and quote endpoints require a Better Auth buyer session."
        : "Public brief intake is anonymous. Catalogue dataset endpoints are deferred. Buyer delivery, subscription, and quote endpoints require a Better Auth buyer session.",
      rateLimits:
        "Read endpoints are limited to 120 requests per 15 minutes per client IP; write endpoints are limited to 30 requests per hour per client IP.",
      endpoints: getV1EndpointDocs(),
    },
    context,
  );
}

export async function handleV1Datasets(request: NextRequest) {
  const context = await prepareV1CatalogueRequest(request, "datasets", "read");
  if (context instanceof NextResponse) return context;

  return withV1Span("v1.datasets.list", {}, async () => {
    const data = await listPublicDatasets(request);
    return v1Json(data, context);
  });
}

export async function handleV1Dataset(
  request: NextRequest,
  datasetId: string,
) {
  const context = await prepareV1CatalogueRequest(
    request,
    "datasets.detail",
    "read",
  );
  if (context instanceof NextResponse) return context;
  const parsedDatasetId = parseId(context, "dataset", datasetId);
  if (!parsedDatasetId.ok) return parsedDatasetId.response;

  return withV1Span(
    "v1.datasets.detail",
    { "caudals.dataset_id": parsedDatasetId.value },
    async () => {
      const dataset = await getPublicDataset(parsedDatasetId.value);
      if (!dataset) {
        return v1Error(context, 404, "not_found", "Dataset not found.");
      }

      return v1Json({ dataset }, context);
    },
  );
}

export async function handleV1DatasetVersions(
  request: NextRequest,
  datasetId: string,
) {
  const context = await prepareV1CatalogueRequest(
    request,
    "datasets.versions",
    "read",
  );
  if (context instanceof NextResponse) return context;
  const parsedDatasetId = parseId(context, "dataset", datasetId);
  if (!parsedDatasetId.ok) return parsedDatasetId.response;

  return withV1Span(
    "v1.datasets.versions",
    { "caudals.dataset_id": parsedDatasetId.value },
    async () => {
      const versions = await listPublicDatasetVersions(parsedDatasetId.value);
      if (versions.length === 0) {
        return v1Error(context, 404, "not_found", "Dataset not found.");
      }

      return v1Json({ versions, count: versions.length }, context);
    },
  );
}

export async function handleV1DatasetVersion(
  request: NextRequest,
  datasetId: string,
  versionId: string,
) {
  const context = await prepareV1CatalogueRequest(
    request,
    "datasets.version",
    "read",
  );
  if (context instanceof NextResponse) return context;
  const parsedDatasetId = parseId(context, "dataset", datasetId);
  if (!parsedDatasetId.ok) return parsedDatasetId.response;
  const parsedVersionId = parseId(context, "version", versionId);
  if (!parsedVersionId.ok) return parsedVersionId.response;

  return withV1Span(
    "v1.datasets.version",
    {
      "caudals.dataset_id": parsedDatasetId.value,
      "caudals.dataset_version_id": parsedVersionId.value,
    },
    async () => {
      const row = await getPublicDatasetVersionRow(
        parsedDatasetId.value,
        parsedVersionId.value,
      );
      if (!row) {
        return v1Error(context, 404, "not_found", "Dataset version not found.");
      }

      return v1Json({ version: mapPublicDatasetVersion(row) }, context);
    },
  );
}

export async function handleV1DatasetSample(
  request: NextRequest,
  datasetId: string,
  versionId: string,
) {
  const context = await prepareV1CatalogueRequest(
    request,
    "datasets.sample",
    "read",
  );
  if (context instanceof NextResponse) return context;
  const parsedDatasetId = parseId(context, "dataset", datasetId);
  if (!parsedDatasetId.ok) return parsedDatasetId.response;
  const parsedVersionId = parseId(context, "version", versionId);
  if (!parsedVersionId.ok) return parsedVersionId.response;

  return withV1Span(
    "v1.datasets.sample",
    {
      "caudals.dataset_id": parsedDatasetId.value,
      "caudals.dataset_version_id": parsedVersionId.value,
    },
    async () => {
      const row = await getPublicDatasetVersionRow(
        parsedDatasetId.value,
        parsedVersionId.value,
      );
      if (!row) {
        return v1Error(context, 404, "not_found", "Dataset version not found.");
      }

      const decision = evaluateSamplePreviewGate({
        listingState: row.listingState,
        visibility: row.visibility,
        previewUri: row.samplePreviewUri,
        policy: toRecord(row.samplePreviewPolicy),
      });

      if (!decision.allowed) {
        return v1Error(
          context,
          403,
          "sample_preview_blocked",
          "Sample preview is not available for this version.",
          decision,
        );
      }

      return v1Json(
        {
          datasetId: row.datasetId,
          versionId: row.versionId,
          samplePreviewUri: row.samplePreviewUri,
          decision,
        },
        context,
      );
    },
  );
}

export async function handleV1DatasetAccessRequest(
  request: NextRequest,
  datasetId: string,
  versionId: string,
) {
  const context = await prepareV1CatalogueRequest(
    request,
    "datasets.access",
    "write",
  );
  if (context instanceof NextResponse) return context;
  const parsedDatasetId = parseId(context, "dataset", datasetId);
  if (!parsedDatasetId.ok) return parsedDatasetId.response;
  const parsedVersionId = parseId(context, "version", versionId);
  if (!parsedVersionId.ok) return parsedVersionId.response;
  const body = await readJsonBody(request);
  const parsedBody = v1AccessRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return v1Error(
      context,
      422,
      "validation_failed",
      "Access request validation failed.",
      parsedBody.error.flatten(),
    );
  }

  return withV1Span(
    "v1.datasets.access_request",
    {
      "caudals.dataset_id": parsedDatasetId.value,
      "caudals.dataset_version_id": parsedVersionId.value,
    },
    async () => {
      const row = await getPublicDatasetVersionRow(
        parsedDatasetId.value,
        parsedVersionId.value,
      );
      if (!row) {
        return v1Error(context, 404, "not_found", "Dataset version not found.");
      }
      const inferredModality = inferredModalitySchema.safeParse(row.modality);

      if (!inferredModality.success) {
        return v1Error(
          context,
          500,
          "invalid_dataset_modality",
          "Dataset modality is not supported by v1 intake.",
        );
      }

      const result = await routePublicBuyerBriefIntake(
        {
          ...parsedBody.data,
          focusArea: "buy-dataset",
          datasetModality: inferredModality.data,
          catalogueListingId: row.listingId,
          requestedDatasetId: row.datasetId,
        },
        {
          clientIp: context.clientIp,
          referer: request.headers.get("referer"),
          userAgent: request.headers.get("user-agent"),
        },
      );

      if (result.status !== "routed") {
        return v1Error(
          context,
          503,
          "intake_unavailable",
          "Dataset access intake is not available.",
        );
      }

      return v1Json(
        {
          datasetId: row.datasetId,
          versionId: row.versionId,
          request: {
            buyerOpportunityId: result.buyerOpportunityId,
            datasetBriefId: result.datasetBriefId,
          },
        },
        context,
        { status: 202 },
      );
    },
  );
}

export async function handleV1Briefs(request: NextRequest) {
  const context = await prepareV1Request(request, "briefs.create", "write");
  if (context instanceof NextResponse) return context;
  const body = await readJsonBody(request);
  const parsedBody = v1BriefBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return v1Error(
      context,
      422,
      "validation_failed",
      "Brief validation failed.",
      parsedBody.error.flatten(),
    );
  }

  return withV1Span(
    "v1.briefs.create",
    { "caudals.focus_area": parsedBody.data.focusArea },
    async () => {
      const result = await routePublicBuyerBriefIntake(parsedBody.data, {
        clientIp: context.clientIp,
        referer: request.headers.get("referer"),
        userAgent: request.headers.get("user-agent"),
      });

      if (result.status !== "routed") {
        return v1Error(
          context,
          503,
          "intake_unavailable",
          "Brief intake is not available.",
        );
      }

      return v1Json(
        {
          brief: {
            id: result.datasetBriefId,
            buyerOpportunityId: result.buyerOpportunityId,
          },
        },
        context,
        { status: 201 },
      );
    },
  );
}

export async function handleV1Brief(
  request: NextRequest,
  briefId: string,
) {
  const context = await prepareV1Request(request, "briefs.detail", "read");
  if (context instanceof NextResponse) return context;
  const parsedBriefId = parseId(context, "brief", briefId);
  if (!parsedBriefId.ok) return parsedBriefId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span(
    "v1.briefs.detail",
    { "caudals.dataset_brief_id": parsedBriefId.value },
    async () => {
      const brief = await getBriefForBuyer(parsedBriefId.value, buyer.session);
      if (!brief) {
        return v1Error(context, 404, "not_found", "Brief not found.");
      }

      return v1Json({ brief }, context);
    },
  );
}

export async function handleV1ApproveQuote(
  request: NextRequest,
  briefId: string,
) {
  const context = await prepareV1Request(request, "briefs.approve_quote", "write");
  if (context instanceof NextResponse) return context;
  const parsedBriefId = parseId(context, "brief", briefId);
  if (!parsedBriefId.ok) return parsedBriefId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;
  const body = await readJsonBody(request);
  const parsedBody = approveQuoteSchema.safeParse(body ?? {});

  if (!parsedBody.success) {
    return v1Error(
      context,
      422,
      "validation_failed",
      "Quote approval validation failed.",
      parsedBody.error.flatten(),
    );
  }

  return withV1Span(
    "v1.briefs.approve_quote",
    { "caudals.dataset_brief_id": parsedBriefId.value },
    async () => {
      const result = await approveBriefQuote(
        buyer.session,
        parsedBriefId.value,
        parsedBody.data.quoteId,
      );

      if (result.status === "missing") {
        return v1Error(context, 404, "not_found", "Sent quote not found.");
      }

      if (result.status === "blocked") {
        return v1Error(
          context,
          409,
          "invalid_state",
          `Quote cannot be approved from state ${result.state}.`,
        );
      }

      return v1Json({ quote: result.quote }, context);
    },
  );
}

export async function handleV1Deliveries(request: NextRequest) {
  const context = await prepareV1Request(request, "deliveries", "read");
  if (context instanceof NextResponse) return context;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span("v1.deliveries.list", {}, async () => {
    const workspace = await getBuyerWorkspaceData(buyer.session);
    return v1Json(
      {
        deliveries: workspace.deliveries,
        summary: {
          deliveryCount: workspace.summary.deliveryCount,
          averageQualityScore: workspace.summary.averageQualityScore,
        },
      },
      context,
    );
  });
}

export async function handleV1Delivery(
  request: NextRequest,
  deliveryId: string,
) {
  const context = await prepareV1Request(request, "deliveries.detail", "read");
  if (context instanceof NextResponse) return context;
  const parsedDeliveryId = parseId(context, "delivery", deliveryId);
  if (!parsedDeliveryId.ok) return parsedDeliveryId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span(
    "v1.deliveries.detail",
    { "caudals.delivery_id": parsedDeliveryId.value },
    async () => {
      const [delivery] = await queryBuyerDeliveries(
        buyer.session,
        parsedDeliveryId.value,
      );
      if (!delivery) {
        return v1Error(context, 404, "not_found", "Delivery not found.");
      }

      return v1Json({ delivery }, context);
    },
  );
}

export async function handleV1DeliveryAccept(
  request: NextRequest,
  deliveryId: string,
) {
  const context = await prepareV1Request(request, "deliveries.accept", "write");
  if (context instanceof NextResponse) return context;
  const parsedDeliveryId = parseId(context, "delivery", deliveryId);
  if (!parsedDeliveryId.ok) return parsedDeliveryId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span(
    "v1.deliveries.accept",
    { "caudals.delivery_id": parsedDeliveryId.value },
    async () => {
      const result = await transitionDelivery(
        buyer.session,
        parsedDeliveryId.value,
        "accepted",
      );

      if (result.status === "missing") {
        return v1Error(context, 404, "not_found", "Delivery not found.");
      }

      if (result.status === "blocked") {
        return v1Error(
          context,
          409,
          "invalid_state",
          `Delivery cannot be accepted from state ${result.state}.`,
        );
      }

      return v1Json({ delivery: result.delivery }, context);
    },
  );
}

export async function handleV1DeliveryDispute(
  request: NextRequest,
  deliveryId: string,
) {
  const context = await prepareV1Request(request, "deliveries.dispute", "write");
  if (context instanceof NextResponse) return context;
  const parsedDeliveryId = parseId(context, "delivery", deliveryId);
  if (!parsedDeliveryId.ok) return parsedDeliveryId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;
  const body = await readJsonBody(request);
  const parsedBody = disputeSchema.safeParse(body);

  if (!parsedBody.success) {
    return v1Error(
      context,
      422,
      "validation_failed",
      "Dispute validation failed.",
      parsedBody.error.flatten(),
    );
  }

  return withV1Span(
    "v1.deliveries.dispute",
    { "caudals.delivery_id": parsedDeliveryId.value },
    async () => {
      const result = await transitionDelivery(
        buyer.session,
        parsedDeliveryId.value,
        "disputed",
        { reason: parsedBody.data.reason },
      );

      if (result.status === "missing") {
        return v1Error(context, 404, "not_found", "Delivery not found.");
      }

      if (result.status === "blocked") {
        return v1Error(
          context,
          409,
          "invalid_state",
          `Delivery cannot be disputed from state ${result.state}.`,
        );
      }

      return v1Json({ delivery: result.delivery }, context);
    },
  );
}

export async function handleV1Subscriptions(request: NextRequest) {
  const context = await prepareV1Request(request, "subscriptions", "read");
  if (context instanceof NextResponse) return context;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span("v1.subscriptions.list", {}, async () => {
    const workspace = await getBuyerWorkspaceData(buyer.session);
    return v1Json(
      {
        subscriptions: workspace.subscriptions,
        summary: {
          activeSubscriptions: workspace.summary.activeSubscriptions,
          nextRefreshAt: workspace.summary.nextRefreshAt,
        },
      },
      context,
    );
  });
}

export async function handleV1SubscriptionRefreshes(
  request: NextRequest,
  subscriptionId: string,
) {
  const context = await prepareV1Request(request, "subscriptions.refreshes", "read");
  if (context instanceof NextResponse) return context;
  const parsedSubscriptionId = parseId(context, "subscription", subscriptionId);
  if (!parsedSubscriptionId.ok) return parsedSubscriptionId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span(
    "v1.subscriptions.refreshes",
    { "caudals.subscription_id": parsedSubscriptionId.value },
    async () => {
      const [subscription] = await queryBuyerSubscriptions(
        buyer.session,
        parsedSubscriptionId.value,
      );
      if (!subscription) {
        return v1Error(context, 404, "not_found", "Subscription not found.");
      }

      const refreshes = await querySubscriptionRefreshes(
        buyer.session,
        parsedSubscriptionId.value,
      );
      return v1Json({ subscription, refreshes, count: refreshes.length }, context);
    },
  );
}

export async function handleV1SubscriptionPause(
  request: NextRequest,
  subscriptionId: string,
) {
  const context = await prepareV1Request(request, "subscriptions.pause", "write");
  if (context instanceof NextResponse) return context;
  const parsedSubscriptionId = parseId(context, "subscription", subscriptionId);
  if (!parsedSubscriptionId.ok) return parsedSubscriptionId.response;
  const buyer = await requireBuyerSession(context, request);
  if (!buyer.ok) return buyer.response;

  return withV1Span(
    "v1.subscriptions.pause",
    { "caudals.subscription_id": parsedSubscriptionId.value },
    async () => {
      const result = await pauseSubscription(
        buyer.session,
        parsedSubscriptionId.value,
      );

      if (result.status === "missing") {
        return v1Error(context, 404, "not_found", "Subscription not found.");
      }

      if (result.status === "blocked") {
        return v1Error(
          context,
          409,
          "invalid_state",
          `Subscription cannot be paused from state ${result.state}.`,
        );
      }

      const [subscription] = await queryBuyerSubscriptions(
        buyer.session,
        parsedSubscriptionId.value,
      );
      return v1Json({ subscription }, context);
    },
  );
}
