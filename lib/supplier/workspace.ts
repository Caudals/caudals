import "server-only";

import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";
import type { CurrentSupplierSession } from "@/lib/supplier/session";

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type SupplierAssetRow = {
  id: string;
  name: string;
  modality: string;
  declaredVolume: Record<string, unknown> | string | null;
  refreshPolicy: string;
  sensitivity: string;
  rightsSummary: Record<string, unknown> | string | null;
  state: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  sampleUploadUri: string | null;
  sampleUploadFilename: string | null;
  sampleUploadBytes: number | string | null;
  sampleUploadContentType: string | null;
  sampleUploadRequestedAt: string | Date | null;
  sampleUploadReceivedAt: string | Date | null;
  supplierPortalMetadata: Record<string, unknown> | string | null;
  contractId: string | null;
  contractState: string | null;
  contractEndsAt: string | Date | null;
  licenseClauses: unknown;
};

type SupplierBuildRow = {
  id: string;
  title: string;
  state: string;
  etaAt: string | Date | null;
  qScore: number | string | null;
  costBudgetCents: number | string | null;
  costUsedCents: number | string | null;
  opportunityId: string | null;
  opportunityTitle: string | null;
  opportunityState: string | null;
  latestGate: string | null;
  latestGateState: string | null;
};

export type SupplierLicenseClause = {
  id: string;
  permitsTrain: boolean;
  permitsFinetune: boolean;
  permitsEval: boolean;
  permitsCommercialInference: boolean;
  permitsRedistribute: boolean;
  exclusivity: string;
  geo: string[];
};

export type SupplierAsset = {
  id: string;
  name: string;
  modality: string;
  declaredVolume: Record<string, unknown>;
  refreshPolicy: string;
  sensitivity: string;
  rightsSummary: Record<string, unknown>;
  state: string;
  createdAt: string;
  updatedAt: string;
  sampleUpload: {
    uri: string | null;
    filename: string | null;
    bytes: number | null;
    contentType: string | null;
    requestedAt: string | null;
    receivedAt: string | null;
  };
  contract: {
    id: string | null;
    state: string | null;
    endsAt: string | null;
  };
  licenseClauses: SupplierLicenseClause[];
  portalMetadata: Record<string, unknown>;
};

export type SupplierBuild = {
  id: string;
  title: string;
  state: string;
  etaAt: string | null;
  qScore: number | null;
  budgetCents: number | null;
  usedCents: number | null;
  opportunity: {
    id: string | null;
    title: string | null;
    state: string | null;
  };
  latestGate: {
    key: string | null;
    state: string | null;
  };
};

export type SupplierWorkspaceData = {
  supplier: CurrentSupplierSession["supplier"];
  authOrganization: CurrentSupplierSession["authOrganization"];
  role: CurrentSupplierSession["role"];
  summary: {
    assetCount: number;
    samplesReceived: number;
    buildsInFlight: number;
    rightsApproved: number;
  };
  assets: SupplierAsset[];
  builds: SupplierBuild[];
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

function toLicenseClauses(value: unknown): SupplierLicenseClause[] {
  if (!Array.isArray(value)) {
    if (typeof value !== "string") {
      return [];
    }

    try {
      return toLicenseClauses(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const record = entry as Record<string, unknown>;
      return {
        id: typeof record.id === "string" ? record.id : "",
        permitsTrain: record.permitsTrain === true,
        permitsFinetune: record.permitsFinetune === true,
        permitsEval: record.permitsEval === true,
        permitsCommercialInference: record.permitsCommercialInference === true,
        permitsRedistribute: record.permitsRedistribute === true,
        exclusivity:
          typeof record.exclusivity === "string" ? record.exclusivity : "none",
        geo: Array.isArray(record.geo)
          ? record.geo.filter((item): item is string => typeof item === "string")
          : [],
      };
    })
    .filter((entry): entry is SupplierLicenseClause => Boolean(entry?.id));
}

function mapAsset(row: SupplierAssetRow): SupplierAsset {
  return {
    id: row.id,
    name: row.name,
    modality: row.modality,
    declaredVolume: toRecord(row.declaredVolume),
    refreshPolicy: row.refreshPolicy,
    sensitivity: row.sensitivity,
    rightsSummary: toRecord(row.rightsSummary),
    state: row.state,
    createdAt: toIsoString(row.createdAt) ?? "",
    updatedAt: toIsoString(row.updatedAt) ?? "",
    sampleUpload: {
      uri: row.sampleUploadUri,
      filename: row.sampleUploadFilename,
      bytes: toNumber(row.sampleUploadBytes),
      contentType: row.sampleUploadContentType,
      requestedAt: toIsoString(row.sampleUploadRequestedAt),
      receivedAt: toIsoString(row.sampleUploadReceivedAt),
    },
    contract: {
      id: row.contractId,
      state: row.contractState,
      endsAt: toIsoString(row.contractEndsAt),
    },
    licenseClauses: toLicenseClauses(row.licenseClauses),
    portalMetadata: toRecord(row.supplierPortalMetadata),
  };
}

function mapBuild(row: SupplierBuildRow): SupplierBuild {
  return {
    id: row.id,
    title: row.title,
    state: row.state,
    etaAt: toIsoString(row.etaAt),
    qScore: toNumber(row.qScore),
    budgetCents: toNumber(row.costBudgetCents),
    usedCents: toNumber(row.costUsedCents),
    opportunity: {
      id: row.opportunityId,
      title: row.opportunityTitle,
      state: row.opportunityState,
    },
    latestGate: {
      key: row.latestGate,
      state: row.latestGateState,
    },
  };
}

export async function getSupplierWorkspaceData(
  session: CurrentSupplierSession,
  query: QueryRows = queryRows,
): Promise<SupplierWorkspaceData> {
  const dbSession = { orgId: session.tenantOrgId };

  const [assetRows, buildRows] = await Promise.all([
    query<SupplierAssetRow>(
      `
        SELECT
          sa.id,
          sa.name,
          sa.modality,
          sa.declared_volume AS "declaredVolume",
          sa.refresh_policy AS "refreshPolicy",
          sa.sensitivity,
          sa.rights_summary AS "rightsSummary",
          sa.state,
          sa.created_at AS "createdAt",
          sa.updated_at AS "updatedAt",
          sa.sample_upload_uri AS "sampleUploadUri",
          sa.sample_upload_filename AS "sampleUploadFilename",
          sa.sample_upload_bytes AS "sampleUploadBytes",
          sa.sample_upload_content_type AS "sampleUploadContentType",
          sa.sample_upload_requested_at AS "sampleUploadRequestedAt",
          sa.sample_upload_received_at AS "sampleUploadReceivedAt",
          sa.supplier_portal_metadata AS "supplierPortalMetadata",
          ct.id AS "contractId",
          ct.state AS "contractState",
          ct.ends_at AS "contractEndsAt",
          COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', lc.id,
                'permitsTrain', lc.permits_train,
                'permitsFinetune', lc.permits_finetune,
                'permitsEval', lc.permits_eval,
                'permitsCommercialInference', lc.permits_inference_commercial,
                'permitsRedistribute', lc.permits_redistribute,
                'exclusivity', lc.exclusivity,
                'geo', lc.geo
              )
              ORDER BY lc.created_at DESC
            ) FILTER (WHERE lc.id IS NOT NULL),
            '[]'::jsonb
          ) AS "licenseClauses"
        FROM supplier_asset sa
        LEFT JOIN contract ct ON ct.id = sa.contract_id AND ct.deleted_at IS NULL
        LEFT JOIN license_clause lc ON lc.contract_id = ct.id AND lc.deleted_at IS NULL
        WHERE sa.org_id = $2
          AND sa.deleted_at IS NULL
          AND (
            sa.supplier_org_id = $1
            OR ct.counterparty_org_id = $1
          )
        GROUP BY sa.id, ct.id
        ORDER BY sa.updated_at DESC
        LIMIT 24
      `,
      [session.supplier.id, session.tenantOrgId],
      dbSession,
    ),
    query<SupplierBuildRow>(
      `
        SELECT
          bd.id,
          bd.title,
          bd.state,
          bd.eta_at AS "etaAt",
          bd.q_score AS "qScore",
          bd.cost_budget_cents AS "costBudgetCents",
          bd.cost_used_cents AS "costUsedCents",
          so.id AS "opportunityId",
          so.title AS "opportunityTitle",
          so.state AS "opportunityState",
          ge.gate_key AS "latestGate",
          ge.verdict AS "latestGateState"
        FROM build bd
        JOIN supplier_opportunity so
          ON so.id = bd.supplier_opportunity_id
          AND so.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT gate_key, verdict
          FROM gate_event ge
          WHERE ge.build_id = bd.id
          ORDER BY ge.created_at DESC
          LIMIT 1
        ) ge ON true
        WHERE bd.org_id = $2
          AND bd.deleted_at IS NULL
          AND so.supplier_org_id = $1
        ORDER BY bd.updated_at DESC
        LIMIT 8
      `,
      [session.supplier.id, session.tenantOrgId],
      dbSession,
    ),
  ]);

  const assets = assetRows.map(mapAsset);
  const builds = buildRows.map(mapBuild);

  return {
    supplier: session.supplier,
    authOrganization: session.authOrganization,
    role: session.role,
    summary: {
      assetCount: assets.length,
      samplesReceived: assets.filter((asset) => asset.sampleUpload.receivedAt)
        .length,
      buildsInFlight: builds.filter(
        (build) => !["released", "delivered", "rework"].includes(build.state),
      ).length,
      rightsApproved: assets.filter((asset) => asset.state === "approved").length,
    },
    assets,
    builds,
  };
}
