"use server";

import * as Sentry from "@sentry/nextjs";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { queryRows } from "@/lib/db/client";
import { createPrefixedId } from "@/lib/operator/ids";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";
import { isSupplierPortalEnabled } from "@/lib/supplier/feature-flags";
import { getCurrentSupplierSession } from "@/lib/supplier/session";
import {
  buildSupplierSampleUploadPlan,
  createSupplierSampleUploadUrl,
  validateSupplierSampleUploadInput,
} from "@/lib/supplier/uploads";

const tracer = trace.getTracer("caudals.supplier_portal");

const modalities = [
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "timeseries",
  "document",
] as const;

const refreshPolicies = [
  "one_shot",
  "scheduled",
  "on_event",
  "perpetual",
] as const;

const sensitivities = ["public", "confidential", "pii", "special"] as const;

const createAssetSchema = z.object({
  name: z.string().trim().min(4).max(120),
  modality: z.enum(modalities),
  declaredVolume: z.string().trim().min(2).max(240),
  refreshPolicy: z.enum(refreshPolicies),
  sensitivity: z.enum(sensitivities),
  intendedAvailability: z.enum(["private", "catalogue"]),
  rightsSummary: z.string().trim().min(12).max(1_200),
  ownershipConfirmed: z.boolean(),
  aiTrainingRights: z.boolean(),
  derivativeRights: z.boolean(),
  endUserConsent: z.boolean().optional().default(false),
  thirdPartyContent: z.boolean().optional().default(false),
});

const sampleUploadSchema = z.object({
  assetId: z.string().trim().min(4).max(80),
  fileName: z.string().trim().min(1).max(160),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.number().int().positive(),
});

const confirmUploadSchema = z.object({
  assetId: z.string().trim().min(4).max(80),
  sampleUri: z.string().trim().min(8).max(600),
});

type CreateAssetResult =
  | {
      ok: true;
      assetId: string;
      auditEventId: string;
    }
  | ActionError;

type SampleUploadIntentResult =
  | {
      ok: true;
      assetId: string;
      sampleUri: string;
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
      expiresInSeconds: number;
      auditEventId: string;
    }
  | ActionError;

type ConfirmSampleUploadResult =
  | {
      ok: true;
      assetId: string;
      state: string;
      auditEventId: string;
    }
  | ActionError;

type PortalSupplierLookup = Awaited<ReturnType<typeof getCurrentSupplierSession>>;

type AssetLookupRow = {
  id: string;
  state: string;
};

type MutationRow = {
  id: string;
  state?: string;
  audit_event_id: string;
};

function assertPortalEnabled() {
  if (!isSupplierPortalEnabled()) {
    return actionError("FORBIDDEN", "Supplier portal is disabled.");
  }

  return null;
}

function assertSupplierCanWrite(lookup: PortalSupplierLookup) {
  if (lookup.status === "unauthenticated") {
    return actionError("UNAUTHORIZED", "Sign in to continue.");
  }

  if (lookup.status !== "authorized") {
    return actionError("FORBIDDEN", "Supplier access is required.");
  }

  if (lookup.session.role === "supplier_viewer") {
    return actionError("FORBIDDEN", "Supplier viewer accounts are read-only.");
  }

  return null;
}

async function withSupplierSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean | null | undefined>,
  callback: () => Promise<T>,
) {
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      if (value !== undefined && value !== null) {
        span.setAttribute(key, value);
      }
    }

    try {
      const result = await callback();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "unknown",
      });
      Sentry.captureException(error);
      throw error;
    } finally {
      span.end();
    }
  });
}

export async function createSupplierAssetDeclaration(
  input: unknown,
): Promise<CreateAssetResult> {
  const featureError = assertPortalEnabled();
  if (featureError) return featureError;

  const parsed = parseInput(createAssetSchema, input);
  if (!parsed.success) return parsed.error;

  if (!parsed.data.ownershipConfirmed || !parsed.data.aiTrainingRights) {
    return actionError(
      "VALIDATION_ERROR",
      "Ownership and AI-training rights must be confirmed before declaring an asset.",
      {
        ownershipConfirmed: parsed.data.ownershipConfirmed
          ? []
          : ["Confirm ownership or authority to monetize this data."],
        aiTrainingRights: parsed.data.aiTrainingRights
          ? []
          : ["Confirm AI-training rights before submitting this asset."],
      },
    );
  }

  const lookup = await getCurrentSupplierSession();
  const accessError = assertSupplierCanWrite(lookup);
  if (accessError) return accessError;
  if (lookup.status !== "authorized") {
    return actionError("FORBIDDEN", "Supplier access is required.");
  }

  return withSupplierSpan(
    "supplier.asset_declare",
    {
      "supplier.org_id": lookup.session.supplier.id,
      "supplier.tenant_org_id": lookup.session.tenantOrgId,
    },
    async () => {
      const assetId = createPrefixedId("sa");
      const auditId = createPrefixedId("ae");
      const rightsSummary = {
        summary: parsed.data.rightsSummary,
        intendedAvailability: parsed.data.intendedAvailability,
        ownershipConfirmed: parsed.data.ownershipConfirmed,
        aiTrainingRights: parsed.data.aiTrainingRights,
        derivativeRights: parsed.data.derivativeRights,
        endUserConsent: parsed.data.endUserConsent,
        thirdPartyContent: parsed.data.thirdPartyContent,
        declaredBy: "supplier_portal",
      };

      const rows = await queryRows<MutationRow>(
        `
          WITH latest_contract AS (
            SELECT id
            FROM contract
            WHERE org_id = $2
              AND counterparty_org_id = $3
              AND contract_type IN ('supplier', 'nda', 'msa')
              AND state IN ('signed', 'active', 'renewed')
              AND deleted_at IS NULL
            ORDER BY
              CASE WHEN contract_type = 'supplier' THEN 0 ELSE 1 END,
              updated_at DESC
            LIMIT 1
          ),
          inserted AS (
            INSERT INTO supplier_asset (
              id,
              org_id,
              supplier_org_id,
              contract_id,
              name,
              modality,
              declared_volume,
              refresh_policy,
              sensitivity,
              rights_summary,
              state
            )
            VALUES (
              $1,
              $2,
              $3,
              (SELECT id FROM latest_contract),
              $4,
              $5,
              jsonb_build_object('summary', $6::text),
              $7,
              $8,
              $9::jsonb,
              'declared'
            )
            RETURNING id, org_id
          ),
          audit AS (
            INSERT INTO audit_event (
              id,
              org_id,
              actor_id,
              action,
              target_type,
              target_id,
              metadata
            )
            SELECT
              $10,
              org_id,
              NULL,
              'supplier_asset_declared',
              'supplier_asset',
              id,
              jsonb_build_object(
                'supplier_org_id', $3::text,
                'auth_user_id', $11::text,
                'auth_organization_id', $12::text,
                'modality', $5::text,
                'sensitivity', $8::text
              )
            FROM inserted
            RETURNING id
          )
          SELECT inserted.id, audit.id AS audit_event_id
          FROM inserted, audit
        `,
        [
          assetId,
          lookup.session.tenantOrgId,
          lookup.session.supplier.id,
          parsed.data.name,
          parsed.data.modality,
          parsed.data.declaredVolume,
          parsed.data.refreshPolicy,
          parsed.data.sensitivity,
          JSON.stringify(rightsSummary),
          auditId,
          lookup.session.authUser.id,
          lookup.session.authOrganization.id,
        ],
        { orgId: lookup.session.tenantOrgId },
      );

      const row = rows[0];
      if (!row) {
        return actionError("DB_ERROR", "Asset declaration was not persisted.");
      }

      revalidatePath("/supplier");

      return {
        ok: true,
        assetId: row.id,
        auditEventId: row.audit_event_id,
      };
    },
  );
}

async function getWritableSupplierAsset(
  assetId: string,
  lookup: Extract<PortalSupplierLookup, { status: "authorized" }>,
) {
  const [asset] = await queryRows<AssetLookupRow>(
    `
      SELECT sa.id, sa.state
      FROM supplier_asset sa
      LEFT JOIN contract ct ON ct.id = sa.contract_id AND ct.deleted_at IS NULL
      WHERE sa.id = $1
        AND sa.org_id = $2
        AND sa.deleted_at IS NULL
        AND (
          sa.supplier_org_id = $3
          OR ct.counterparty_org_id = $3
        )
      LIMIT 1
    `,
    [assetId, lookup.session.tenantOrgId, lookup.session.supplier.id],
    { orgId: lookup.session.tenantOrgId },
  );

  return asset ?? null;
}

export async function requestSupplierSampleUpload(
  input: unknown,
): Promise<SampleUploadIntentResult> {
  const featureError = assertPortalEnabled();
  if (featureError) return featureError;

  const parsed = parseInput(sampleUploadSchema, input);
  if (!parsed.success) return parsed.error;

  const uploadValidationError = validateSupplierSampleUploadInput(parsed.data);
  if (uploadValidationError) {
    return actionError("VALIDATION_ERROR", uploadValidationError);
  }

  const lookup = await getCurrentSupplierSession();
  const accessError = assertSupplierCanWrite(lookup);
  if (accessError) return accessError;
  if (lookup.status !== "authorized") {
    return actionError("FORBIDDEN", "Supplier access is required.");
  }

  return withSupplierSpan(
    "supplier.sample_upload.request",
    {
      "supplier.org_id": lookup.session.supplier.id,
      "supplier.asset_id": parsed.data.assetId,
      "supplier.sample_size_bytes": parsed.data.sizeBytes,
    },
    async () => {
      const asset = await getWritableSupplierAsset(parsed.data.assetId, lookup);
      if (!asset) {
        return actionError("NOT_FOUND", "Supplier asset was not found.");
      }

      if (["blocked", "retired"].includes(asset.state)) {
        return actionError(
          "CONFLICT",
          "Blocked or retired assets cannot receive new samples.",
        );
      }

      const plan = buildSupplierSampleUploadPlan(lookup.session, parsed.data);
      const uploadUrl = await createSupplierSampleUploadUrl(plan);
      const auditId = createPrefixedId("ae");

      const rows = await queryRows<MutationRow>(
        `
          WITH updated AS (
            UPDATE supplier_asset
            SET
              supplier_org_id = COALESCE(supplier_org_id, $2),
              sample_upload_uri = $3,
              sample_upload_filename = $4,
              sample_upload_bytes = $5,
              sample_upload_content_type = $6,
              sample_upload_requested_at = now(),
              supplier_portal_metadata = supplier_portal_metadata || jsonb_build_object(
                'latestUploadIntent',
                jsonb_build_object(
                  'sampleUri', $3::text,
                  'fileName', $4::text,
                  'sizeBytes', $5::bigint,
                  'contentType', $6::text,
                  'requestedByAuthUserId', $8::text,
                  'requestedAt', now()
                )
              )
            WHERE id = $1
              AND org_id = $7
              AND deleted_at IS NULL
            RETURNING id, org_id
          ),
          audit AS (
            INSERT INTO audit_event (
              id,
              org_id,
              actor_id,
              action,
              target_type,
              target_id,
              metadata
            )
            SELECT
              $9,
              org_id,
              NULL,
              'supplier_sample_upload_url_issued',
              'supplier_asset',
              id,
              jsonb_build_object(
                'supplier_org_id', $2::text,
                'auth_user_id', $8::text,
                'sample_uri', $3::text,
                'file_name', $4::text,
                'size_bytes', $5::bigint,
                'content_type', $6::text
              )
            FROM updated
            RETURNING id
          )
          SELECT updated.id, audit.id AS audit_event_id
          FROM updated, audit
        `,
        [
          parsed.data.assetId,
          lookup.session.supplier.id,
          plan.uri,
          parsed.data.fileName,
          parsed.data.sizeBytes,
          parsed.data.contentType,
          lookup.session.tenantOrgId,
          lookup.session.authUser.id,
          auditId,
        ],
        { orgId: lookup.session.tenantOrgId },
      );

      const row = rows[0];
      if (!row) {
        return actionError(
          "DB_ERROR",
          "Sample upload request was not persisted.",
        );
      }

      revalidatePath("/supplier");

      return {
        ok: true,
        assetId: row.id,
        sampleUri: plan.uri,
        uploadUrl,
        uploadHeaders: {
          "Content-Type": parsed.data.contentType,
        },
        expiresInSeconds: plan.expiresInSeconds,
        auditEventId: row.audit_event_id,
      };
    },
  );
}

export async function confirmSupplierSampleUpload(
  input: unknown,
): Promise<ConfirmSampleUploadResult> {
  const featureError = assertPortalEnabled();
  if (featureError) return featureError;

  const parsed = parseInput(confirmUploadSchema, input);
  if (!parsed.success) return parsed.error;

  const lookup = await getCurrentSupplierSession();
  const accessError = assertSupplierCanWrite(lookup);
  if (accessError) return accessError;
  if (lookup.status !== "authorized") {
    return actionError("FORBIDDEN", "Supplier access is required.");
  }

  return withSupplierSpan(
    "supplier.sample_upload.confirm",
    {
      "supplier.org_id": lookup.session.supplier.id,
      "supplier.asset_id": parsed.data.assetId,
    },
    async () => {
      const auditId = createPrefixedId("ae");
      const rows = await queryRows<MutationRow>(
        `
          WITH target AS (
            SELECT sa.id, sa.org_id, sa.state
            FROM supplier_asset sa
            LEFT JOIN contract ct ON ct.id = sa.contract_id AND ct.deleted_at IS NULL
            WHERE sa.id = $1
              AND sa.org_id = $2
              AND sa.sample_upload_uri = $4
              AND sa.deleted_at IS NULL
              AND sa.state NOT IN ('blocked', 'retired')
              AND (
                sa.supplier_org_id = $3
                OR ct.counterparty_org_id = $3
              )
            LIMIT 1
          ),
          updated AS (
            UPDATE supplier_asset sa
            SET
              supplier_org_id = COALESCE(sa.supplier_org_id, $3),
              sample_upload_received_at = now(),
              state = CASE
                WHEN target.state IN ('declared', 'rights_review') THEN 'sample_received'
                ELSE target.state
              END,
              supplier_portal_metadata = supplier_portal_metadata || jsonb_build_object(
                'latestUploadConfirmation',
                jsonb_build_object(
                  'sampleUri', $4::text,
                  'confirmedByAuthUserId', $5::text,
                  'confirmedAt', now()
                )
              )
            FROM target
            WHERE sa.id = target.id
            RETURNING sa.id, sa.org_id, sa.state, target.state AS old_state
          ),
          audit AS (
            INSERT INTO audit_event (
              id,
              org_id,
              actor_id,
              action,
              target_type,
              target_id,
              metadata
            )
            SELECT
              $6,
              org_id,
              NULL,
              CASE
                WHEN old_state <> state THEN 'state_transition'
                ELSE 'supplier_sample_upload_confirmed'
              END,
              'supplier_asset',
              id,
              jsonb_build_object(
                'supplier_org_id', $3::text,
                'auth_user_id', $5::text,
                'sample_uri', $4::text,
                'from_state', old_state,
                'to_state', state
              )
            FROM updated
            RETURNING id
          )
          SELECT updated.id, updated.state, audit.id AS audit_event_id
          FROM updated, audit
        `,
        [
          parsed.data.assetId,
          lookup.session.tenantOrgId,
          lookup.session.supplier.id,
          parsed.data.sampleUri,
          lookup.session.authUser.id,
          auditId,
        ],
        { orgId: lookup.session.tenantOrgId },
      );

      const row = rows[0];
      if (!row) {
        return actionError(
          "CONFLICT",
          "Sample upload could not be confirmed for this supplier asset.",
        );
      }

      revalidatePath("/supplier");

      return {
        ok: true,
        assetId: row.id,
        state: row.state ?? "sample_received",
        auditEventId: row.audit_event_id,
      };
    },
  );
}
