import "server-only";

import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";
import type { CurrentBuyerSession } from "@/lib/buyer/session";

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type BuyerDeliveryRow = {
  id: string;
  state: string;
  channel: string;
  receipt: Record<string, unknown> | string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  subscriptionId: string | null;
  cadence: string | null;
  deliveryChannel: string | null;
  subscriptionState: string | null;
  nextRefreshAt: string | Date | null;
  rollingWindowVersions: number | string | null;
  deliveryPolicy: Record<string, unknown> | string | null;
  datasetId: string | null;
  datasetName: string | null;
  modality: string | null;
  datasetVersionId: string | null;
  versionLabel: string | null;
  datasetManifestUri: string | null;
  contentHash: string | null;
  recordCount: number | string | null;
  datasetQaScore: number | string | null;
  releasedAt: string | Date | null;
  composedPermits: Record<string, unknown> | string | null;
  deltaManifestId: string | null;
  deltaState: string | null;
  deltaManifestUri: string | null;
  deltaManifestHash: string | null;
  addedRecords: number | string | null;
  updatedRecords: number | string | null;
  deletedRecords: number | string | null;
  tombstonedRecords: number | string | null;
  totalRecords: number | string | null;
  deltaQualityScore: number | string | null;
  rightsReverified: boolean | null;
  privacyVerified: boolean | null;
  deltaSummary: Record<string, unknown> | string | null;
  qaReportId: string | null;
  qaDimensions: Record<string, unknown> | string | null;
  qaCompositeScore: number | string | null;
  qaVerdict: string | null;
  piiState: string | null;
  piiFindings: Record<string, unknown> | string | null;
  piiTreatments: Record<string, unknown> | string | null;
  contractId: string | null;
  contractState: string | null;
  contractEndsAt: string | Date | null;
  offerTerms: Record<string, unknown> | string | null;
};

type BuyerSubscriptionSummaryRow = {
  activeSubscriptions: number | string;
  nextRefreshAt: string | Date | null;
};

export type BuyerScorecardDimension = {
  key: string;
  label: string;
  score: number;
};

export type BuyerDelivery = {
  id: string;
  state: string;
  channel: string;
  receipt: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  subscription: {
    id: string | null;
    state: string | null;
    cadence: string | null;
    deliveryChannel: string | null;
    nextRefreshAt: string | null;
    rollingWindowVersions: number | null;
    deliveryPolicy: Record<string, unknown>;
  };
  dataset: {
    id: string | null;
    name: string;
    modality: string | null;
  };
  version: {
    id: string | null;
    label: string | null;
    manifestUri: string | null;
    contentHash: string | null;
    recordCount: number | null;
    releasedAt: string | null;
    composedPermits: Record<string, unknown>;
  };
  delta: {
    id: string | null;
    state: string | null;
    manifestUri: string | null;
    manifestHash: string | null;
    addedRecords: number;
    updatedRecords: number;
    deletedRecords: number;
    tombstonedRecords: number;
    totalRecords: number;
    qualityScore: number | null;
    rightsReverified: boolean;
    privacyVerified: boolean;
    summary: Record<string, unknown>;
  };
  scorecard: {
    id: string | null;
    compositeScore: number | null;
    verdict: string | null;
    dimensions: BuyerScorecardDimension[];
  };
  privacy: {
    state: string | null;
    findings: Record<string, unknown>;
    treatments: Record<string, unknown>;
  };
  contract: {
    id: string | null;
    state: string | null;
    endsAt: string | null;
  };
  offerTerms: Record<string, unknown>;
};

export type BuyerWorkspaceData = {
  buyer: CurrentBuyerSession["buyer"];
  authOrganization: CurrentBuyerSession["authOrganization"];
  role: CurrentBuyerSession["role"];
  summary: {
    deliveryCount: number;
    activeSubscriptions: number;
    nextRefreshAt: string | null;
    averageQualityScore: number | null;
  };
  deliveries: BuyerDelivery[];
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

export function formatScorecardDimensionLabel(key: string) {
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function mapScorecardDimensions(
  dimensions: unknown,
): BuyerScorecardDimension[] {
  const record = toRecord(dimensions);

  return Object.entries(record)
    .map(([key, value]) => {
      const score = toNumber(value);
      return score === null
        ? null
        : {
            key,
            label: formatScorecardDimensionLabel(key),
            score: Math.max(0, Math.min(1, score)),
          };
    })
    .filter((dimension): dimension is BuyerScorecardDimension => Boolean(dimension))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function mapDelivery(row: BuyerDeliveryRow): BuyerDelivery {
  const qaCompositeScore = toNumber(row.qaCompositeScore);
  const deltaQualityScore = toNumber(row.deltaQualityScore);
  const datasetQaScore = toNumber(row.datasetQaScore);

  return {
    id: row.id,
    state: row.state,
    channel: row.channel,
    receipt: toRecord(row.receipt),
    createdAt: toIsoString(row.createdAt) ?? "",
    updatedAt: toIsoString(row.updatedAt) ?? "",
    subscription: {
      id: row.subscriptionId,
      state: row.subscriptionState,
      cadence: row.cadence,
      deliveryChannel: row.deliveryChannel,
      nextRefreshAt: toIsoString(row.nextRefreshAt),
      rollingWindowVersions: toNumber(row.rollingWindowVersions),
      deliveryPolicy: toRecord(row.deliveryPolicy),
    },
    dataset: {
      id: row.datasetId,
      name: row.datasetName ?? "Dataset delivery",
      modality: row.modality,
    },
    version: {
      id: row.datasetVersionId,
      label: row.versionLabel,
      manifestUri: row.datasetManifestUri,
      contentHash: row.contentHash,
      recordCount: toNumber(row.recordCount),
      releasedAt: toIsoString(row.releasedAt),
      composedPermits: toRecord(row.composedPermits),
    },
    delta: {
      id: row.deltaManifestId,
      state: row.deltaState,
      manifestUri: row.deltaManifestUri,
      manifestHash: row.deltaManifestHash,
      addedRecords: toInteger(row.addedRecords),
      updatedRecords: toInteger(row.updatedRecords),
      deletedRecords: toInteger(row.deletedRecords),
      tombstonedRecords: toInteger(row.tombstonedRecords),
      totalRecords: toInteger(row.totalRecords),
      qualityScore: deltaQualityScore,
      rightsReverified: row.rightsReverified === true,
      privacyVerified: row.privacyVerified === true,
      summary: toRecord(row.deltaSummary),
    },
    scorecard: {
      id: row.qaReportId,
      compositeScore: qaCompositeScore ?? deltaQualityScore ?? datasetQaScore,
      verdict: row.qaVerdict,
      dimensions: mapScorecardDimensions(row.qaDimensions),
    },
    privacy: {
      state: row.piiState,
      findings: toRecord(row.piiFindings),
      treatments: toRecord(row.piiTreatments),
    },
    contract: {
      id: row.contractId,
      state: row.contractState,
      endsAt: toIsoString(row.contractEndsAt),
    },
    offerTerms: toRecord(row.offerTerms),
  };
}

export async function getBuyerWorkspaceData(
  session: CurrentBuyerSession,
  query: QueryRows = queryRows,
): Promise<BuyerWorkspaceData> {
  const dbSession = { orgId: session.tenantOrgId };

  const [deliveryRows, [subscriptionSummary]] = await Promise.all([
    query<BuyerDeliveryRow>(
      `
        SELECT
          dl.id,
          dl.state,
          dl.channel,
          dl.receipt,
          dl.created_at AS "createdAt",
          dl.updated_at AS "updatedAt",
          su.id AS "subscriptionId",
          su.cadence,
          su.delivery_channel AS "deliveryChannel",
          su.state AS "subscriptionState",
          su.next_refresh_at AS "nextRefreshAt",
          su.rolling_window_versions AS "rollingWindowVersions",
          su.delivery_policy AS "deliveryPolicy",
          ds.id AS "datasetId",
          ds.name AS "datasetName",
          ds.modality,
          dv.id AS "datasetVersionId",
          dv.version_label AS "versionLabel",
          dv.manifest_uri AS "datasetManifestUri",
          dv.content_hash AS "contentHash",
          dv.record_count AS "recordCount",
          dv.qa_score AS "datasetQaScore",
          dv.released_at AS "releasedAt",
          dv.composed_permits AS "composedPermits",
          dm.id AS "deltaManifestId",
          dm.state AS "deltaState",
          dm.manifest_uri AS "deltaManifestUri",
          dm.manifest_hash AS "deltaManifestHash",
          dm.added_records AS "addedRecords",
          dm.updated_records AS "updatedRecords",
          dm.deleted_records AS "deletedRecords",
          dm.tombstoned_records AS "tombstonedRecords",
          dm.total_records AS "totalRecords",
          dm.quality_score AS "deltaQualityScore",
          dm.rights_reverified AS "rightsReverified",
          dm.privacy_verified AS "privacyVerified",
          dm.summary AS "deltaSummary",
          qr.id AS "qaReportId",
          qr.dimensions AS "qaDimensions",
          qr.composite_score AS "qaCompositeScore",
          qr.verdict AS "qaVerdict",
          pm.state AS "piiState",
          pm.findings AS "piiFindings",
          pm.treatments AS "piiTreatments",
          ct.id AS "contractId",
          ct.state AS "contractState",
          ct.ends_at AS "contractEndsAt",
          po.terms AS "offerTerms"
        FROM delivery dl
        LEFT JOIN subscription su ON su.id = dl.subscription_id AND su.deleted_at IS NULL
        LEFT JOIN dataset_version dv ON dv.id = dl.dataset_version_id AND dv.deleted_at IS NULL
        LEFT JOIN dataset ds ON ds.id = dv.dataset_id AND ds.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT *
          FROM delta_manifest dm
          WHERE dm.delivery_id = dl.id
            AND dm.deleted_at IS NULL
          ORDER BY dm.updated_at DESC
          LIMIT 1
        ) dm ON true
        LEFT JOIN qa_report qr ON qr.id = dm.qa_report_id AND qr.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT *
          FROM pii_map pm
          WHERE pm.dataset_version_id = dv.id
            AND pm.deleted_at IS NULL
          ORDER BY
            CASE WHEN pm.state = 'approved' THEN 0 ELSE 1 END,
            pm.updated_at DESC
          LIMIT 1
        ) pm ON true
        LEFT JOIN contract ct ON ct.id = su.contract_id AND ct.deleted_at IS NULL
        LEFT JOIN private_offer po ON po.id = su.private_offer_id AND po.deleted_at IS NULL
        WHERE dl.buyer_org_id = $1
          AND dl.deleted_at IS NULL
        ORDER BY dl.updated_at DESC
        LIMIT 12
      `,
      [session.buyer.id],
      dbSession,
    ),
    query<BuyerSubscriptionSummaryRow>(
      `
        SELECT
          count(*) FILTER (WHERE state IN ('active', 'refreshing'))::int AS "activeSubscriptions",
          min(next_refresh_at) FILTER (WHERE state IN ('active', 'refreshing')) AS "nextRefreshAt"
        FROM subscription
        WHERE buyer_org_id = $1
          AND deleted_at IS NULL
      `,
      [session.buyer.id],
      dbSession,
    ),
  ]);

  const deliveries = deliveryRows.map(mapDelivery);
  const qualityScores = deliveries
    .map((delivery) => delivery.scorecard.compositeScore)
    .filter((score): score is number => score !== null);

  return {
    buyer: session.buyer,
    authOrganization: session.authOrganization,
    role: session.role,
    summary: {
      deliveryCount: deliveries.length,
      activeSubscriptions: toInteger(subscriptionSummary?.activeSubscriptions),
      nextRefreshAt: toIsoString(subscriptionSummary?.nextRefreshAt),
      averageQualityScore:
        qualityScores.length === 0
          ? null
          : qualityScores.reduce((total, score) => total + score, 0) /
            qualityScores.length,
    },
    deliveries,
  };
}
