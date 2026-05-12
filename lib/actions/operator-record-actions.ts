"use server";

import { z } from "zod";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { queryRows, type QueryValue } from "@/lib/db/client";
import {
  operatorModuleKeys,
  type OperatorModuleKey,
  type OperatorWorkItem,
} from "@/lib/operator/console-snapshot";
import { createPrefixedId } from "@/lib/operator/ids";
import {
  isActiveLearningLoopEnabled,
  validateActiveLearningLoopEvidence,
} from "@/lib/operator/active-learning";
import {
  isCleanlabQaPassEnabled,
  validateCleanlabQaEvidence,
} from "@/lib/operator/cleanlab";
import {
  isSubscriptionDeliveryEnabled,
  validateDeltaManifestEvidence,
  validateSubscriptionDeliveryEvidence,
} from "@/lib/operator/subscription-delivery";
import {
  isModalityContractsEnabled,
  validateEnrichmentManifest,
} from "@/lib/operator/modality-contracts";
import {
  getOperatorRecordCrudDescriptor,
  getOperatorRecordFieldDescriptors,
  isOperatorRecordCrudType,
  operatorRecordCrudTypes,
  type OperatorRecordCrudType,
} from "@/lib/operator/record-crud";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";

const moduleKeySchema = z.enum(operatorModuleKeys);
const recordTypeSchema = z.enum(operatorRecordCrudTypes);

const createRecordSchema = z.object({
  moduleKey: moduleKeySchema,
  recordType: recordTypeSchema,
  title: z.string().trim().min(2).max(160),
  detail: z.string().trim().max(1000).optional(),
  state: z.string().trim().min(1).max(80),
  fields: z.record(z.string(), z.string().trim().max(500)).optional(),
});

const updateRecordSchema = createRecordSchema.extend({
  targetId: z.string().trim().min(4).max(80),
  expectedUpdatedAt: z.string().trim().datetime().optional(),
});

const deleteRecordSchema = z.object({
  moduleKey: moduleKeySchema,
  recordType: recordTypeSchema,
  targetId: z.string().trim().min(4).max(80),
  expectedUpdatedAt: z.string().trim().datetime().optional(),
});

type CurrentOperatorContext = {
  orgId: string;
  operatorId: string;
};

type MutationRow = {
  id: string;
  updated_at?: string | Date;
  created_at?: string | Date;
};

type OperatorRecordMutationResult =
  | { ok: true; record: OperatorWorkItem; auditEventId: string }
  | { ok: true; deletedRecordId: string; auditEventId: string }
  | ActionError;

type SqlMutation = {
  sql: string;
  values: QueryValue[];
};

type NormalizedRecordFields = Record<string, string>;
type CreateRecordInput = z.infer<typeof createRecordSchema> & {
  fields: NormalizedRecordFields;
};
type UpdateRecordInput = z.infer<typeof updateRecordSchema> & {
  fields: NormalizedRecordFields;
};

function isActionError(
  result: NormalizedRecordFields | ActionError
): result is ActionError {
  return "error" in result && "code" in result;
}

const mutableTables = {
  organization: { table: "organization", prefix: "or", softDelete: true },
  contact: { table: "contact", prefix: "co", softDelete: true },
  alert: { table: "alert", prefix: "al", softDelete: true },
  buyer_opportunity: { table: "buyer_opportunity", prefix: "bo", softDelete: true },
  supplier_opportunity: {
    table: "supplier_opportunity",
    prefix: "so",
    softDelete: true,
  },
  supplier_asset: { table: "supplier_asset", prefix: "sa", softDelete: true },
  contract: { table: "contract", prefix: "ct", softDelete: true },
  license_clause: { table: "license_clause", prefix: "lc", softDelete: true },
  consent_record: { table: "consent_record", prefix: "cr", softDelete: true },
  dataset_brief: { table: "dataset_brief", prefix: "br", softDelete: true },
  delivery: { table: "delivery", prefix: "dl", softDelete: true },
  subscription: { table: "subscription", prefix: "su", softDelete: true },
  delta_manifest: { table: "delta_manifest", prefix: "dm", softDelete: true },
  build: { table: "build", prefix: "bd", softDelete: true },
  build_plan: { table: "build_plan", prefix: "bp", softDelete: true },
  dataset: { table: "dataset", prefix: "dt", softDelete: true },
  dataset_version: { table: "dataset_version", prefix: "dv", softDelete: true },
  modality_contract: {
    table: "modality_contract",
    prefix: "mc",
    softDelete: true,
  },
  qa_report: { table: "qa_report", prefix: "qr", softDelete: true },
  enrichment_manifest: {
    table: "enrichment_manifest",
    prefix: "em",
    softDelete: true,
  },
  label_batch: { table: "label_batch", prefix: "lb", softDelete: true },
  active_learning_loop: {
    table: "active_learning_loop",
    prefix: "ll",
    softDelete: true,
  },
  cleanlab_qa_pass: {
    table: "cleanlab_qa_pass",
    prefix: "cq",
    softDelete: true,
  },
  dsar_request: { table: "dsar_request", prefix: "ds", softDelete: true },
  pii_map: { table: "pii_map", prefix: "pm", softDelete: true },
  catalogue_listing: {
    table: "catalogue_listing",
    prefix: "cl",
    softDelete: true,
  },
  private_offer: { table: "private_offer", prefix: "po", softDelete: true },
  sample_preview_access: {
    table: "sample_preview_access",
    prefix: "pa",
    softDelete: true,
  },
  quote: { table: "quote", prefix: "qt", softDelete: true },
  invoice: { table: "invoice", prefix: "iv", softDelete: true },
  payout: { table: "payout", prefix: "py", softDelete: true },
  run: { table: "run", prefix: "rn", softDelete: true },
  cost_entry: { table: "cost_entry", prefix: "ce", softDelete: false },
  integration: { table: "integration", prefix: "in", softDelete: true },
  signing_key: { table: "signing_key", prefix: "sk", softDelete: true },
} as const;

function normalizeDate(value: string | Date | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  return value instanceof Date ? value.toISOString() : value;
}

function getStateSeverity(state: string): OperatorWorkItem["severity"] {
  if (
    [
      "blocked",
      "closed_lost",
      "terminated",
      "rework",
      "fail",
      "disputed",
      "failed",
      "held",
      "revoked",
    ].includes(state)
  ) {
    return "critical";
  }

  if (
    [
      "review",
      "rights_review",
      "draft",
      "drafting",
      "queued",
      "in_adjudication",
      "paused",
      "pending",
      "refreshing",
      "validating",
      "ready",
    ].includes(state)
  ) {
    return "warning";
  }

  return "info";
}

function buildWorkItem(
  moduleKey: OperatorModuleKey,
  recordType: OperatorRecordCrudType,
  row: MutationRow,
  title: string,
  detail: string | undefined,
  state: string,
  fields: NormalizedRecordFields = {}
): OperatorWorkItem {
  const hasFields = Object.keys(fields).length > 0;

  return {
    moduleKey,
    recordType,
    id: row.id,
    title,
    state,
    detail: detail || getOperatorRecordCrudDescriptor(recordType)?.label || recordType,
    ...(hasFields ? { fields } : {}),
    updatedAt: normalizeDate(row.updated_at ?? row.created_at),
    severity: getStateSeverity(state),
    nextAction: "Review record",
  };
}

function validateCrudSupport(
  recordType: OperatorRecordCrudType,
  mode: "create" | "update" | "delete"
) {
  const descriptor = getOperatorRecordCrudDescriptor(recordType);

  if (!descriptor) {
    return actionError("VALIDATION_ERROR", "Unsupported record type");
  }

  const allowed =
    mode === "create"
      ? descriptor.canCreate
      : mode === "update"
        ? descriptor.canUpdate
        : descriptor.canDelete;

  if (!allowed) {
    return actionError(
      "CONFLICT",
      descriptor.immutableReason ??
        `${descriptor.label} does not support ${mode} from the Operator Console.`
    );
  }

  return null;
}

function validateState(recordType: OperatorRecordCrudType, state: string) {
  const descriptor = getOperatorRecordCrudDescriptor(recordType);

  if (!descriptor?.stateOptions.includes(state)) {
    return actionError(
      "VALIDATION_ERROR",
      `Unsupported state "${state}" for ${descriptor?.label ?? recordType}`
    );
  }

  return null;
}

function splitCsvField(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function validateM2RecordEvidence(
  recordType: OperatorRecordCrudType,
  state: string,
  fields: NormalizedRecordFields
) {
  if (
    (recordType === "modality_contract" ||
      recordType === "enrichment_manifest") &&
    !isModalityContractsEnabled()
  ) {
    return actionError(
      "CONFLICT",
      "M2 modality and enrichment controls are disabled by MODALITY_CONTRACTS_ENABLED."
    );
  }

  if (recordType === "enrichment_manifest") {
    const missingCore = [
      ["addedColumns", "Added columns"],
      ["sources", "Sources"],
      ["sourceLicense", "Source license"],
      ["computationMethod", "Computation method"],
    ].filter(([key]) => !fields[key]);

    if (missingCore.length > 0) {
      return actionError(
        "VALIDATION_ERROR",
        `Enrichment manifest requires ${missingCore
          .map(([, label]) => label)
          .join(", ")}.`
      );
    }

    if (state === "approved") {
      const validation = validateEnrichmentManifest({
        enrichmentClass: fields.enrichmentClass ?? "geospatial",
        addedColumns: splitCsvField(fields.addedColumns),
        sources: splitCsvField(fields.sources),
        sourceLicense: fields.sourceLicense ?? "",
        computationMethod: fields.computationMethod ?? "",
        spotCheckRate: fields.spotCheckRate
          ? Number(fields.spotCheckRate)
          : null,
        independencePassed: fields.independencePassed === "true",
        licenseCompatible: fields.licenseCompatible === "true",
      });

      if (!validation.ok) {
        return actionError(
          "VALIDATION_ERROR",
          `Enrichment manifest is missing approval evidence: ${validation.missing.join(", ")}.`
        );
      }
    }
  }

  if (recordType === "active_learning_loop") {
    if (!isActiveLearningLoopEnabled()) {
      return actionError(
        "CONFLICT",
        "M2 active-learning controls are disabled by ACTIVE_LEARNING_LOOP_ENABLED."
      );
    }

    const validation = validateActiveLearningLoopEvidence(
      {
        strategy: fields.strategy ?? "",
        candidateSourceUri: fields.candidateSourceUri,
        embeddingIndexUri: fields.embeddingIndexUri,
        modelSnapshotUri: fields.modelSnapshotUri,
        uncertaintyMetric: fields.uncertaintyMetric,
        diversityMetric: fields.diversityMetric,
        boundaryMetric: fields.boundaryMetric,
        targetSampleSize: fields.targetSampleSize
          ? Number(fields.targetSampleSize)
          : null,
        selectedCount: fields.selectedCount ? Number(fields.selectedCount) : null,
        selectionManifestUri: fields.selectionManifestUri,
        reviewerRouting: fields.reviewerRouting,
      },
      state
    );

    if (!validation.ok) {
      return actionError(
        "VALIDATION_ERROR",
        `Active-learning loop is missing routing evidence: ${validation.missing.join(", ")}.`
      );
    }
  }

  if (recordType === "cleanlab_qa_pass") {
    if (!isCleanlabQaPassEnabled()) {
      return actionError(
        "CONFLICT",
        "M2 Cleanlab QA controls are disabled by CLEANLAB_QA_PASS_ENABLED."
      );
    }

    const validation = validateCleanlabQaEvidence(
      {
        scanStrategy: fields.scanStrategy ?? "",
        inputManifestUri: fields.inputManifestUri,
        cleanlabReportUri: fields.cleanlabReportUri,
        modelSnapshotUri: fields.modelSnapshotUri,
        scannedCount: fields.scannedCount ? Number(fields.scannedCount) : null,
        suspectedLabelErrors: fields.suspectedLabelErrors
          ? Number(fields.suspectedLabelErrors)
          : null,
        estimatedErrorRate: fields.estimatedErrorRate
          ? Number(fields.estimatedErrorRate)
          : null,
        errorRateThreshold: fields.errorRateThreshold
          ? Number(fields.errorRateThreshold)
          : null,
        requeueCount: fields.requeueCount ? Number(fields.requeueCount) : null,
        requeueManifestUri: fields.requeueManifestUri,
      },
      state
    );

    if (!validation.ok) {
      return actionError(
        "VALIDATION_ERROR",
        `Cleanlab QA pass is missing scan evidence: ${validation.missing.join(", ")}.`
      );
    }
  }

  if (recordType === "subscription") {
    if (!isSubscriptionDeliveryEnabled()) {
      return actionError(
        "CONFLICT",
        "M2 subscription delivery controls are disabled by SUBSCRIPTION_DELIVERY_ENABLED."
      );
    }

    const validation = validateSubscriptionDeliveryEvidence(
      {
        cadence: fields.cadence ?? "",
        deliveryChannel: fields.deliveryChannel ?? "",
        rollingWindowVersions: fields.rollingWindowVersions
          ? Number(fields.rollingWindowVersions)
          : null,
        nextRefreshAt: fields.nextRefreshAt,
      },
      state
    );

    if (!validation.ok) {
      return actionError(
        "VALIDATION_ERROR",
        `Subscription is missing delivery evidence: ${validation.missing.join(", ")}.`
      );
    }
  }

  if (recordType === "delta_manifest") {
    if (!isSubscriptionDeliveryEnabled()) {
      return actionError(
        "CONFLICT",
        "M2 subscription delivery controls are disabled by SUBSCRIPTION_DELIVERY_ENABLED."
      );
    }

    const validation = validateDeltaManifestEvidence(
      {
        manifestUri: fields.manifestUri,
        manifestHash: fields.manifestHash,
        previousDatasetVersionId: fields.previousDatasetVersionId,
        deliveryId: fields.deliveryId,
        qaReportId: fields.qaReportId,
        addedRecords: fields.addedRecords ? Number(fields.addedRecords) : null,
        updatedRecords: fields.updatedRecords
          ? Number(fields.updatedRecords)
          : null,
        deletedRecords: fields.deletedRecords
          ? Number(fields.deletedRecords)
          : null,
        tombstonedRecords: fields.tombstonedRecords
          ? Number(fields.tombstonedRecords)
          : null,
        totalRecords: fields.totalRecords ? Number(fields.totalRecords) : null,
        qualityScore: fields.qualityScore ? Number(fields.qualityScore) : null,
        rightsReverified: fields.rightsReverified === "true",
        privacyVerified: fields.privacyVerified === "true",
        deletionNoticeUri: fields.deletionNoticeUri,
      },
      state
    );

    if (!validation.ok) {
      return actionError(
        "VALIDATION_ERROR",
        `Delta manifest is missing refresh evidence: ${validation.missing.join(", ")}.`
      );
    }
  }

  return null;
}

function normalizeRecordFields(
  recordType: OperatorRecordCrudType,
  rawFields: Record<string, string> | undefined
): NormalizedRecordFields | ActionError {
  const descriptors = getOperatorRecordFieldDescriptors(recordType);
  const allowedKeys = new Set(descriptors.map((field) => field.key));
  const fields = rawFields ?? {};
  const normalized: NormalizedRecordFields = {};

  for (const [key, value] of Object.entries(fields)) {
    const trimmed = value.trim();

    if (!trimmed) {
      continue;
    }

    if (!allowedKeys.has(key)) {
      return actionError(
        "VALIDATION_ERROR",
        `Unsupported field "${key}" for ${getOperatorRecordCrudDescriptor(recordType)?.label ?? recordType}`
      );
    }

    const descriptor = descriptors.find((field) => field.key === key);
    if (!descriptor) {
      continue;
    }

    if (descriptor.kind === "integer") {
      if (!/^\d+$/.test(trimmed)) {
        return actionError(
          "VALIDATION_ERROR",
          `${descriptor.label} must be a whole number.`
        );
      }

      const parsed = Number(trimmed);
      if (
        !Number.isSafeInteger(parsed) ||
        (descriptor.min !== undefined && parsed < descriptor.min) ||
        (descriptor.max !== undefined && parsed > descriptor.max)
      ) {
        return actionError(
          "VALIDATION_ERROR",
          `${descriptor.label} must be between ${descriptor.min ?? 0} and ${descriptor.max ?? Number.MAX_SAFE_INTEGER}.`
        );
      }

      normalized[key] = String(parsed);
      continue;
    }

    if (descriptor.kind === "text") {
      const normalizedText =
        descriptor.caseTransform === "upper"
          ? trimmed.toUpperCase()
          : descriptor.caseTransform === "lower"
            ? trimmed.toLowerCase()
            : trimmed;

      if (
        descriptor.maxLength !== undefined &&
        normalizedText.length > descriptor.maxLength
      ) {
        return actionError(
          "VALIDATION_ERROR",
          `${descriptor.label} must be ${descriptor.maxLength} characters or fewer.`
        );
      }

      if (
        descriptor.allowedValues &&
        !descriptor.allowedValues.includes(normalizedText)
      ) {
        return actionError(
          "VALIDATION_ERROR",
          `${descriptor.label} must be one of ${descriptor.allowedValues.join(", ")}.`
        );
      }

      normalized[key] = normalizedText;
      continue;
    }

    const parsed = Number(trimmed);
    if (
      !Number.isFinite(parsed) ||
      (descriptor.min !== undefined && parsed < descriptor.min) ||
      (descriptor.max !== undefined && parsed > descriptor.max)
    ) {
      return actionError(
        "VALIDATION_ERROR",
        `${descriptor.label} must be between ${descriptor.min ?? "-infinity"} and ${descriptor.max ?? "infinity"}.`
      );
    }

    normalized[key] = String(parsed);
  }

  return normalized;
}

async function getMutationContext(): Promise<CurrentOperatorContext | ActionError> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  return {
    orgId,
    operatorId: session.operator.id,
  };
}

function insertAuditCte(action: string) {
  return `
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
        $5,
        $2,
        $6,
        '${action}',
        $7,
        inserted.id,
        jsonb_build_object(
          'title', $8::text,
          'detail', $9::text,
          'state', $10::text,
          'fields', $11::jsonb
        )
      FROM inserted
      RETURNING id
    )
  `;
}

function buildCreateSql(
  recordType: OperatorRecordCrudType,
  recordId: string,
  auditId: string,
  context: CurrentOperatorContext,
  input: CreateRecordInput
): SqlMutation | ActionError {
  const detail = input.detail || "";
  const fieldsJson = JSON.stringify(input.fields);
  const baseValues = [
    recordId,
    context.orgId,
    input.title,
    input.state,
    auditId,
    context.operatorId,
    recordType,
    input.title,
    detail,
    input.state,
    fieldsJson,
  ];

  const sqlByType: Partial<Record<OperatorRecordCrudType, string>> = {
    organization: `
      WITH inserted AS (
        INSERT INTO organization (
          id, kind, legal_name, display_name, website, state, created_by, org_id
        )
        VALUES (
          $1,
          CASE
            WHEN $12 = 'buyers' THEN 'buyer'
            WHEN $12 = 'suppliers' THEN 'supplier'
            ELSE 'partner'
          END,
          $3,
          $3,
          NULLIF($9, ''),
          $4,
          $6,
          $2
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    contact: `
      WITH inserted AS (
        INSERT INTO contact (
          id, org_id, full_name, role, signing_authority, created_by
        )
        VALUES ($1, $2, $3, NULLIF($9, ''), $4 = 'signing_authority', $6)
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    alert: `
      WITH inserted AS (
        INSERT INTO alert (id, org_id, severity, title, target_type, target_id, state, created_by)
        VALUES ($1, $2, 'warning', $3, 'operator_console', $1, $4, $6)
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    buyer_opportunity: `
      WITH inserted AS (
        INSERT INTO buyer_opportunity (
          id, org_id, title, use_case, modality, budget_range, timeline,
          state, created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          COALESCE(NULLIF($9, ''), 'Operator-created opportunity'),
          COALESCE(NULLIF($11::jsonb ->> 'modality', ''), 'mixed'),
          jsonb_strip_nulls(jsonb_build_object(
            'summary',
            NULLIF($11::jsonb ->> 'budgetRange', '')
          )),
          NULLIF($11::jsonb ->> 'timeline', ''),
          $4,
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    supplier_opportunity: `
      WITH inserted AS (
        INSERT INTO supplier_opportunity (id, org_id, title, asset_summary, state, created_by)
        VALUES ($1, $2, $3, COALESCE(NULLIF($9, ''), 'Operator-created supplier asset'), $4, $6)
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    supplier_asset: `
      WITH inserted AS (
        INSERT INTO supplier_asset (
          id, org_id, name, modality, declared_volume, refresh_policy,
          sensitivity, rights_summary, state, created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          COALESCE(NULLIF($11::jsonb ->> 'modality', ''), 'tabular'),
          jsonb_strip_nulls(jsonb_build_object(
            'summary',
            NULLIF($11::jsonb ->> 'declaredVolume', '')
          )),
          COALESCE(NULLIF($11::jsonb ->> 'refreshPolicy', ''), 'one_shot'),
          COALESCE(NULLIF($11::jsonb ->> 'sensitivity', ''), 'confidential'),
          jsonb_build_object('summary', NULLIF($9, '')),
          $4,
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    contract: `
      WITH counterparty AS (
        SELECT COALESCE(
          (
            SELECT id
            FROM organization
            WHERE org_id = $2 AND id <> $2 AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
          ),
          $2
        ) AS id
      ),
      inserted AS (
        INSERT INTO contract (
          id, org_id, counterparty_org_id, contract_type, document_uri,
          signed_at, starts_at, ends_at, state, created_by
        )
        SELECT
          $1,
          $2,
          id,
          COALESCE(
            NULLIF($11::jsonb ->> 'contractType', ''),
            CASE WHEN $12 IN ('buyers', 'commercials') THEN 'buyer' ELSE 'supplier' END
          ),
          COALESCE(NULLIF($11::jsonb ->> 'documentUri', ''), NULLIF($9, '')),
          NULLIF($11::jsonb ->> 'signedAt', '')::timestamptz,
          NULLIF($11::jsonb ->> 'startsAt', '')::timestamptz,
          NULLIF($11::jsonb ->> 'endsAt', '')::timestamptz,
          $4,
          $6
        FROM counterparty
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    license_clause: `
      WITH target_contract AS (
        SELECT id
        FROM contract
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      input_fields AS (
        SELECT
          regexp_replace(
            COALESCE(NULLIF($11::jsonb ->> 'permittedUses', ''), ''),
            '[[:space:]]+',
            '',
            'g'
          ) AS permitted_uses,
          COALESCE(NULLIF($11::jsonb ->> 'exclusivity', ''), 'none') AS exclusivity,
          COALESCE(NULLIF($11::jsonb ->> 'shareAlike', '')::boolean, false) AS share_alike,
          NULLIF($11::jsonb ->> 'termEndsAt', '')::timestamptz AS term_ends_at
      ),
      inserted AS (
        INSERT INTO license_clause (
          id, org_id, contract_id, asset_scope, permits_train,
          permits_finetune, permits_eval, permits_inference_commercial,
          permits_redistribute, exclusivity, geo, term_ends_at,
          share_alike, notes, state, created_by
        )
        SELECT
          $1,
          $2,
          target_contract.id,
          jsonb_build_object('summary', COALESCE(NULLIF($9, ''), $3)),
          strpos(',' || input_fields.permitted_uses || ',', ',train,') > 0,
          strpos(',' || input_fields.permitted_uses || ',', ',finetune,') > 0,
          strpos(',' || input_fields.permitted_uses || ',', ',eval,') > 0,
          strpos(',' || input_fields.permitted_uses || ',', ',commercial_inference,') > 0,
          strpos(',' || input_fields.permitted_uses || ',', ',redistribute,') > 0,
          input_fields.exclusivity,
          COALESCE(
            (
              SELECT array_agg(upper(trim(value)))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'geo', ''), 'WW'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            ARRAY['WW']::text[]
          ),
          input_fields.term_ends_at,
          input_fields.share_alike,
          NULLIF($9, ''),
          $4,
          $6
        FROM target_contract CROSS JOIN input_fields
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    consent_record: `
      WITH target_asset AS (
        SELECT id
        FROM supplier_asset
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO consent_record (
          id, org_id, supplier_asset_id, subject_ref, lawful_basis,
          evidence_uri, state, created_by
        )
        SELECT
          $1,
          $2,
          id,
          $3,
          COALESCE(
            NULLIF($11::jsonb ->> 'lawfulBasis', ''),
            NULLIF($9, ''),
            'contract'
          ),
          COALESCE(
            NULLIF($11::jsonb ->> 'evidenceUri', ''),
            NULLIF($9, '')
          ),
          $4,
          $6
        FROM target_asset
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    dataset_brief: `
      WITH inserted AS (
        INSERT INTO dataset_brief (
          id, org_id, title, requirements, sensitivity_constraints,
          target_formats, state, created_by
        )
        VALUES (
          $1, $2, $3, jsonb_build_object('summary', NULLIF($9, '')),
          jsonb_strip_nulls(jsonb_build_object(
            'summary',
            NULLIF($11::jsonb ->> 'sensitivityConstraints', '')
          )),
          COALESCE(
            (
              SELECT array_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'targetFormats', ''), ''),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            ARRAY[]::text[]
          ),
          $4,
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    delivery: `
      WITH target_version AS (
        SELECT id
        FROM dataset_version
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_buyer AS (
        SELECT COALESCE(
          (
            SELECT id
            FROM organization
            WHERE org_id = $2 AND kind = 'buyer' AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
          ),
          $2
        ) AS id
      ),
      inserted AS (
        INSERT INTO delivery (
          id, org_id, dataset_version_id, buyer_org_id, channel, receipt, state, created_by
        )
        SELECT
          $1,
          $2,
          target_version.id,
          target_buyer.id,
          COALESCE(NULLIF($11::jsonb ->> 'channel', ''), $3),
          jsonb_strip_nulls(jsonb_build_object(
            'summary', NULLIF($9, ''),
            'receiptHash', NULLIF($11::jsonb ->> 'receiptHash', ''),
            'acceptanceWindowDays',
            NULLIF($11::jsonb ->> 'acceptanceWindowDays', '')::integer
          )),
          $4,
          $6
        FROM target_version CROSS JOIN target_buyer
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    subscription: `
      WITH target_dataset AS (
        SELECT id
        FROM dataset
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_version AS (
        SELECT id
        FROM dataset_version
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_buyer AS (
        SELECT COALESCE(
          (
            SELECT id
            FROM organization
            WHERE org_id = $2 AND kind = 'buyer' AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
          ),
          $2
        ) AS id
      ),
      target_contract AS (
        SELECT id
        FROM contract
        WHERE org_id = $2 AND contract_type = 'buyer' AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_offer AS (
        SELECT id
        FROM private_offer
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO subscription (
          id, org_id, buyer_org_id, dataset_id, contract_id, private_offer_id,
          current_dataset_version_id, cadence, delivery_channel, state,
          rolling_window_versions, next_refresh_at, retention_policy,
          delivery_policy, created_by
        )
        SELECT
          $1,
          $2,
          target_buyer.id,
          target_dataset.id,
          target_contract.id,
          target_offer.id,
          target_version.id,
          COALESCE(NULLIF($11::jsonb ->> 'cadence', ''), 'monthly'),
          COALESCE(NULLIF($11::jsonb ->> 'deliveryChannel', ''), 'delta_share'),
          $4,
          COALESCE(NULLIF($11::jsonb ->> 'rollingWindowVersions', '')::integer, 3),
          NULLIF($11::jsonb ->> 'nextRefreshAt', '')::timestamptz,
          jsonb_strip_nulls(jsonb_build_object(
            'retentionDays', NULLIF($11::jsonb ->> 'retentionDays', '')::integer
          )),
          jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($9, ''))),
          $6
        FROM target_dataset
        CROSS JOIN target_buyer
        LEFT JOIN target_version ON true
        LEFT JOIN target_contract ON true
        LEFT JOIN target_offer ON true
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    delta_manifest: `
      WITH target_subscription AS (
        SELECT id
        FROM subscription
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_version AS (
        SELECT id
        FROM dataset_version
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO delta_manifest (
          id, org_id, subscription_id, dataset_version_id,
          previous_dataset_version_id, delivery_id, qa_report_id, state,
          manifest_uri, manifest_hash, added_records, updated_records,
          deleted_records, tombstoned_records, total_records, quality_score,
          rights_reverified, privacy_verified, deletion_notice_uri, summary,
          created_by
        )
        SELECT
          $1,
          $2,
          target_subscription.id,
          target_version.id,
          NULLIF($11::jsonb ->> 'previousDatasetVersionId', ''),
          NULLIF($11::jsonb ->> 'deliveryId', ''),
          NULLIF($11::jsonb ->> 'qaReportId', ''),
          $4,
          COALESCE(NULLIF($11::jsonb ->> 'manifestUri', ''), NULLIF($9, '')),
          COALESCE(NULLIF($11::jsonb ->> 'manifestHash', ''), 'sha256:pending'),
          COALESCE(NULLIF($11::jsonb ->> 'addedRecords', '')::bigint, 0),
          COALESCE(NULLIF($11::jsonb ->> 'updatedRecords', '')::bigint, 0),
          COALESCE(NULLIF($11::jsonb ->> 'deletedRecords', '')::bigint, 0),
          COALESCE(NULLIF($11::jsonb ->> 'tombstonedRecords', '')::bigint, 0),
          COALESCE(NULLIF($11::jsonb ->> 'totalRecords', '')::bigint, 0),
          NULLIF($11::jsonb ->> 'qualityScore', '')::numeric,
          COALESCE(NULLIF($11::jsonb ->> 'rightsReverified', '')::boolean, false),
          COALESCE(NULLIF($11::jsonb ->> 'privacyVerified', '')::boolean, false),
          NULLIF($11::jsonb ->> 'deletionNoticeUri', ''),
          jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($9, ''))),
          $6
        FROM target_subscription CROSS JOIN target_version
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    build: `
      WITH inserted AS (
        INSERT INTO build (
          id, org_id, title, state, eta_at, q_score,
          cost_budget_cents, cost_used_cents, created_by
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          NULLIF($11::jsonb ->> 'etaAt', '')::timestamptz,
          NULLIF($11::jsonb ->> 'qScore', '')::numeric,
          COALESCE(NULLIF($11::jsonb ->> 'costBudgetCents', '')::bigint, 0),
          COALESCE(NULLIF($11::jsonb ->> 'costUsedCents', '')::bigint, 0),
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    build_plan: `
      WITH target_build AS (
        SELECT id
        FROM build
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO build_plan (
          id, org_id, build_id, manifest_yaml, composed_permits,
          license_blocked, state, created_by
        )
        SELECT
          $1,
          $2,
          id,
          COALESCE(NULLIF($9, ''), 'version: operator-created'),
          jsonb_strip_nulls(jsonb_build_object(
            'summary',
            NULLIF($11::jsonb ->> 'permitSummary', '')
          )),
          COALESCE(NULLIF($11::jsonb ->> 'licenseBlocked', '')::boolean, false),
          $4,
          $6
        FROM target_build
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    dataset: `
      WITH inserted AS (
        INSERT INTO dataset (id, org_id, name, modality, state, created_by)
        VALUES (
          $1,
          $2,
          $3,
          COALESCE(NULLIF($11::jsonb ->> 'modality', ''), NULLIF($9, ''), 'tabular'),
          $4,
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    dataset_version: `
      WITH target_dataset AS (
        SELECT id
        FROM dataset
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO dataset_version (
          id, org_id, dataset_id, version_label, manifest_uri, content_hash,
          composed_permits, qa_score, record_count, size_bytes, state, created_by
        )
        SELECT
          $1,
          $2,
          id,
          $3,
          COALESCE(NULLIF($9, ''), 's3://operator-created/manifest.json'),
          COALESCE(NULLIF($11::jsonb ->> 'contentHash', ''), 'operator-created-' || $1),
          '{}'::jsonb,
          NULLIF($11::jsonb ->> 'qaScore', '')::numeric,
          NULLIF($11::jsonb ->> 'recordCount', '')::bigint,
          NULLIF($11::jsonb ->> 'sizeBytes', '')::bigint,
          $4,
          $6
        FROM target_dataset
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    modality_contract: `
      WITH target_version AS (
        SELECT dv.id, d.modality AS dataset_modality
        FROM dataset_version dv
        JOIN dataset d ON d.id = dv.dataset_id
        WHERE dv.org_id = $2
          AND dv.deleted_at IS NULL
          AND d.deleted_at IS NULL
        ORDER BY dv.released_at DESC NULLS LAST, dv.updated_at DESC
        LIMIT 1
      ),
      resolved AS (
        SELECT
          id AS dataset_version_id,
          CASE
            WHEN NULLIF($11::jsonb ->> 'modality', '') IN ('video','audio','geospatial')
              THEN NULLIF($11::jsonb ->> 'modality', '')
            WHEN dataset_modality IN ('video','audio','geospatial') THEN dataset_modality
            ELSE 'video'
          END AS modality
        FROM target_version
      ),
      inserted AS (
        INSERT INTO modality_contract (
          id, org_id, dataset_version_id, modality, canonical_format,
          profile_signals, cleaning_operators, privacy_treatments,
          labeling_widgets, qa_dimensions, packaging_targets, state, created_by
        )
        SELECT
          $1,
          $2,
          dataset_version_id,
          modality,
          COALESCE(
            NULLIF($11::jsonb ->> 'canonicalFormat', ''),
            NULLIF($9, ''),
            CASE modality
              WHEN 'audio' THEN 'WAV/FLAC plus Lance segment index'
              WHEN 'geospatial' THEN 'STAC plus GeoParquet and Cloud Optimized GeoTIFF'
              ELSE 'Lance index over MP4 chunks'
            END
          ),
          COALESCE(
            (
              SELECT jsonb_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'profileSignals', ''), 'duration_histogram'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            '[]'::jsonb
          ),
          COALESCE(
            (
              SELECT jsonb_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'cleaningOperators', ''), 'metadata_strip'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            '[]'::jsonb
          ),
          COALESCE(
            (
              SELECT jsonb_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'privacyTreatments', ''), 'metadata_strip'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            '[]'::jsonb
          ),
          COALESCE(
            (
              SELECT array_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'labelingWidgets', ''), 'segment'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            ARRAY['segment']::text[]
          ),
          COALESCE(
            (
              SELECT jsonb_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'qaDimensions', ''), 'privacy_residual'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            '[]'::jsonb
          ),
          COALESCE(
            (
              SELECT array_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'packagingTargets', ''), 'manifest'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            ARRAY['manifest']::text[]
          ),
          $4,
          $6
        FROM resolved
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    qa_report: `
      WITH inserted AS (
        INSERT INTO qa_report (id, org_id, dimensions, composite_score, verdict, created_by)
        VALUES (
          $1,
          $2,
          jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($9, ''))),
          NULLIF($11::jsonb ->> 'compositeScore', '')::numeric,
          $4,
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    cleanlab_qa_pass: `
      WITH target_report AS (
        SELECT id, build_id
        FROM qa_report
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_batch AS (
        SELECT id
        FROM label_batch
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO cleanlab_qa_pass (
          id,
          org_id,
          qa_report_id,
          label_batch_id,
          build_id,
          scan_strategy,
          state,
          input_manifest_uri,
          cleanlab_report_uri,
          model_snapshot_uri,
          scanned_count,
          suspected_label_errors,
          estimated_error_rate,
          error_rate_threshold,
          requeue_count,
          requeue_manifest_uri,
          summary,
          created_by
        )
        SELECT
          $1,
          $2,
          target_report.id,
          target_batch.id,
          target_report.build_id,
          COALESCE(NULLIF($11::jsonb ->> 'scanStrategy', ''), 'confident_learning'),
          $4,
          NULLIF($11::jsonb ->> 'inputManifestUri', ''),
          NULLIF($11::jsonb ->> 'cleanlabReportUri', ''),
          NULLIF($11::jsonb ->> 'modelSnapshotUri', ''),
          NULLIF($11::jsonb ->> 'scannedCount', '')::integer,
          NULLIF($11::jsonb ->> 'suspectedLabelErrors', '')::integer,
          NULLIF($11::jsonb ->> 'estimatedErrorRate', '')::numeric,
          NULLIF($11::jsonb ->> 'errorRateThreshold', '')::numeric,
          COALESCE(NULLIF($11::jsonb ->> 'requeueCount', '')::integer, 0),
          NULLIF($11::jsonb ->> 'requeueManifestUri', ''),
          jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($9, ''))),
          $6
        FROM target_report
        LEFT JOIN target_batch ON true
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    enrichment_manifest: `
      WITH target_build AS (
        SELECT id
        FROM build
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_version AS (
        SELECT id
        FROM dataset_version
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY released_at DESC NULLS LAST, updated_at DESC
        LIMIT 1
      ),
      target_contract AS (
        SELECT id
        FROM modality_contract
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO enrichment_manifest (
          id, org_id, build_id, dataset_version_id, modality_contract_id,
          enrichment_class, added_columns, sources, source_license,
          source_version, computation_method, model_identity_hash,
          prompt_template_version, reproducer_uri, spot_check_rate,
          independence_passed, license_compatible, state, created_by
        )
        SELECT
          $1,
          $2,
          target_build.id,
          target_version.id,
          (SELECT id FROM target_contract),
          COALESCE(NULLIF($11::jsonb ->> 'enrichmentClass', ''), 'geospatial'),
          COALESCE(
            (
              SELECT jsonb_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'addedColumns', ''), 'h3_cell'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            '[]'::jsonb
          ),
          COALESCE(
            (
              SELECT jsonb_agg(trim(value))
              FROM regexp_split_to_table(
                COALESCE(NULLIF($11::jsonb ->> 'sources', ''), 'operator_manifest'),
                ','
              ) AS value
              WHERE trim(value) <> ''
            ),
            '[]'::jsonb
          ),
          COALESCE(NULLIF($11::jsonb ->> 'sourceLicense', ''), 'unreviewed'),
          NULLIF($11::jsonb ->> 'sourceVersion', ''),
          COALESCE(NULLIF($11::jsonb ->> 'computationMethod', ''), NULLIF($9, ''), 'operator declared enrichment method'),
          NULLIF($11::jsonb ->> 'modelIdentityHash', ''),
          NULLIF($11::jsonb ->> 'promptTemplateVersion', ''),
          NULLIF($11::jsonb ->> 'reproducerUri', ''),
          NULLIF($11::jsonb ->> 'spotCheckRate', '')::numeric,
          COALESCE(NULLIF($11::jsonb ->> 'independencePassed', '')::boolean, false),
          COALESCE(NULLIF($11::jsonb ->> 'licenseCompatible', '')::boolean, false),
          $4,
          $6
        FROM target_build CROSS JOIN target_version
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    label_batch: `
      WITH target_build AS (
        SELECT id
        FROM build
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO label_batch (
          id, org_id, build_id, state, queue_depth, agreement_score, created_by
        )
        SELECT
          $1,
          $2,
          id,
          $4,
          COALESCE(NULLIF($11::jsonb ->> 'queueDepth', '')::integer, 0),
          NULLIF($11::jsonb ->> 'agreementScore', '')::numeric,
          $6
        FROM target_build
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    active_learning_loop: `
      WITH target_build AS (
        SELECT id
        FROM build
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_label_batch AS (
        SELECT id
        FROM label_batch
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO active_learning_loop (
          id, org_id, build_id, label_batch_id, strategy, state,
          candidate_source_uri, embedding_index_uri, model_snapshot_uri,
          uncertainty_metric, diversity_metric, boundary_metric,
          target_sample_size, selected_count, selection_manifest_uri,
          selection_summary, reviewer_routing, created_by
        )
        SELECT
          $1,
          $2,
          target_build.id,
          (SELECT id FROM target_label_batch),
          COALESCE(NULLIF($11::jsonb ->> 'strategy', ''), 'hybrid_uncertainty_diversity'),
          $4,
          COALESCE(NULLIF($11::jsonb ->> 'candidateSourceUri', ''), $9),
          NULLIF($11::jsonb ->> 'embeddingIndexUri', ''),
          NULLIF($11::jsonb ->> 'modelSnapshotUri', ''),
          COALESCE(NULLIF($11::jsonb ->> 'uncertaintyMetric', ''), 'entropy'),
          COALESCE(NULLIF($11::jsonb ->> 'diversityMetric', ''), 'embedding_distance'),
          COALESCE(NULLIF($11::jsonb ->> 'boundaryMetric', ''), 'margin'),
          COALESCE(NULLIF($11::jsonb ->> 'targetSampleSize', '')::integer, 1),
          COALESCE(NULLIF($11::jsonb ->> 'selectedCount', '')::integer, 0),
          NULLIF($11::jsonb ->> 'selectionManifestUri', ''),
          jsonb_strip_nulls(jsonb_build_object(
            'summary', NULLIF($9, ''),
            'strategy', NULLIF($11::jsonb ->> 'strategy', '')
          )),
          jsonb_strip_nulls(jsonb_build_object(
            'policy', NULLIF($11::jsonb ->> 'reviewerRouting', '')
          )),
          $6
        FROM target_build
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    dsar_request: `
      WITH inserted AS (
        INSERT INTO dsar_request (id, org_id, subject_ref, request_type, state, sla_due_at, created_by)
        VALUES (
          $1,
          $2,
          $3,
          COALESCE(NULLIF($11::jsonb ->> 'requestType', ''), 'access'),
          $4,
          now() + make_interval(days => COALESCE(NULLIF($11::jsonb ->> 'slaDays', '')::integer, 14)),
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    pii_map: `
      WITH target_version AS (
        SELECT id
        FROM dataset_version
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO pii_map (id, org_id, dataset_version_id, findings, treatments, state, created_by)
        SELECT
          $1,
          $2,
          id,
          jsonb_build_object('summary', NULLIF($9, '')),
          jsonb_strip_nulls(jsonb_build_object(
            'summary',
            NULLIF($11::jsonb ->> 'treatmentSummary', '')
          )),
          $4,
          $6
        FROM target_version
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    catalogue_listing: `
      WITH target_version AS (
        SELECT dv.dataset_id, dv.id AS dataset_version_id
        FROM dataset_version dv
        JOIN dataset d ON d.id = dv.dataset_id
        WHERE dv.org_id = $2
          AND dv.deleted_at IS NULL
          AND d.deleted_at IS NULL
        ORDER BY dv.released_at DESC NULLS LAST, dv.updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO catalogue_listing (
          id, org_id, dataset_id, dataset_version_id, title, pricing,
          visibility, sample_preview_uri, sample_preview_policy,
          refresh_cadence, license_tier, state, created_by
        )
        SELECT
          $1,
          $2,
          dataset_id,
          dataset_version_id,
          $3,
          jsonb_strip_nulls(jsonb_build_object(
            'summary', NULLIF($9, ''),
            'priceCents', NULLIF($11::jsonb ->> 'priceCents', '')::integer,
            'currency', NULLIF($11::jsonb ->> 'currency', ''),
            'billingModel', NULLIF($11::jsonb ->> 'billingModel', '')
          )),
          COALESCE(NULLIF($11::jsonb ->> 'visibility', ''), 'private'),
          NULLIF($11::jsonb ->> 'samplePreviewUri', ''),
          jsonb_strip_nulls(jsonb_build_object(
            'gate', COALESCE(NULLIF($11::jsonb ->> 'previewGate', ''), 'nda_required'),
            'watermark', true
          )),
          NULLIF($11::jsonb ->> 'refreshCadence', ''),
          COALESCE(NULLIF($11::jsonb ->> 'licenseTier', ''), 'standard'),
          $4,
          $6
        FROM target_version
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    private_offer: `
      WITH target_version AS (
        SELECT dv.dataset_id, dv.id AS dataset_version_id
        FROM dataset_version dv
        JOIN dataset d ON d.id = dv.dataset_id
        WHERE dv.org_id = $2
          AND dv.deleted_at IS NULL
          AND d.deleted_at IS NULL
        ORDER BY dv.released_at DESC NULLS LAST, dv.updated_at DESC
        LIMIT 1
      ),
      target_buyer AS (
        SELECT COALESCE(
          (
            SELECT id
            FROM organization
            WHERE org_id = $2 AND kind = 'buyer' AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
          ),
          $2
        ) AS id
      ),
      inserted AS (
        INSERT INTO private_offer (
          id, org_id, buyer_org_id, dataset_id, dataset_version_id,
          terms, sample_preview_uri, sample_preview_policy, state, created_by
        )
        SELECT
          $1,
          $2,
          target_buyer.id,
          target_version.dataset_id,
          target_version.dataset_version_id,
          jsonb_strip_nulls(jsonb_build_object(
            'summary', COALESCE(NULLIF($9, ''), $3),
            'offerValueCents', NULLIF($11::jsonb ->> 'offerValueCents', '')::integer,
            'currency', NULLIF($11::jsonb ->> 'currency', ''),
            'expiresAt', NULLIF($11::jsonb ->> 'expiresAt', '')
          )),
          NULLIF($11::jsonb ->> 'samplePreviewUri', ''),
          jsonb_strip_nulls(jsonb_build_object(
            'gate', COALESCE(NULLIF($11::jsonb ->> 'previewGate', ''), 'operator_approved'),
            'watermark', true
          )),
          $4,
          $6
        FROM target_version CROSS JOIN target_buyer
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    sample_preview_access: `
      WITH target_listing AS (
        SELECT id
        FROM catalogue_listing
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      target_buyer AS (
        SELECT COALESCE(
          (
            SELECT id
            FROM organization
            WHERE org_id = $2 AND kind = 'buyer' AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
          ),
          $2
        ) AS id
      ),
      inserted AS (
        INSERT INTO sample_preview_access (
          id, org_id, catalogue_listing_id, buyer_org_id, state,
          nda_acknowledged_at, watermark_subject, decision_reason,
          expires_at, decided_by, created_by
        )
        SELECT
          $1,
          $2,
          target_listing.id,
          target_buyer.id,
          $4,
          CASE WHEN $4 IN ('nda_acknowledged', 'approved') THEN now() ELSE NULL END,
          COALESCE(NULLIF($11::jsonb ->> 'watermarkSubject', ''), 'buyer_org'),
          COALESCE(NULLIF($11::jsonb ->> 'decisionReason', ''), NULLIF($9, '')),
          NULLIF($11::jsonb ->> 'expiresAt', '')::timestamptz,
          CASE WHEN $4 IN ('approved', 'denied', 'revoked', 'expired') THEN $6 ELSE NULL END,
          $6
        FROM target_listing CROSS JOIN target_buyer
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    quote: `
      WITH inserted AS (
        INSERT INTO quote (id, org_id, amount_cents, currency, state, created_by)
        VALUES (
          $1,
          $2,
          COALESCE(NULLIF($11::jsonb ->> 'amountCents', '')::integer, 0),
          COALESCE(NULLIF($11::jsonb ->> 'currency', ''), 'USD'),
          $4,
          $6
        )
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    invoice: `
      WITH target_quote AS (
        SELECT id
        FROM quote
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO invoice (id, org_id, quote_id, stripe_invoice_id, amount_cents, currency, state, created_by)
        SELECT
          $1,
          $2,
          id,
          NULLIF($9, ''),
          COALESCE(NULLIF($11::jsonb ->> 'amountCents', '')::integer, 0),
          COALESCE(NULLIF($11::jsonb ->> 'currency', ''), 'USD'),
          $4,
          $6
        FROM target_quote
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    payout: `
      WITH target_supplier AS (
        SELECT COALESCE(
          (
            SELECT id
            FROM organization
            WHERE org_id = $2 AND kind = 'supplier' AND deleted_at IS NULL
            ORDER BY updated_at DESC
            LIMIT 1
          ),
          $2
        ) AS id
      ),
      inserted AS (
        INSERT INTO payout (id, org_id, supplier_org_id, stripe_transfer_id, amount_cents, currency, state, created_by)
        SELECT
          $1,
          $2,
          id,
          NULLIF($9, ''),
          COALESCE(NULLIF($11::jsonb ->> 'amountCents', '')::integer, 0),
          COALESCE(NULLIF($11::jsonb ->> 'currency', ''), 'USD'),
          $4,
          $6
        FROM target_supplier
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    run: `
      WITH target_build AS (
        SELECT id
        FROM build
        WHERE org_id = $2 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      ),
      inserted AS (
        INSERT INTO run (
          id, org_id, build_id, external_run_id, state, retry_count,
          started_at, finished_at, created_by
        )
        SELECT
          $1,
          $2,
          id,
          COALESCE(NULLIF($11::jsonb ->> 'externalRunId', ''), NULLIF($9, '')),
          $4,
          COALESCE(NULLIF($11::jsonb ->> 'retryCount', '')::integer, 0),
          NULLIF($11::jsonb ->> 'startedAt', '')::timestamptz,
          NULLIF($11::jsonb ->> 'finishedAt', '')::timestamptz,
          $6
        FROM target_build
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    cost_entry: `
      WITH inserted AS (
        INSERT INTO cost_entry (id, org_id, category, amount_cents, currency, metadata, created_by)
        VALUES (
          $1,
          $2,
          $3,
          COALESCE(NULLIF($11::jsonb ->> 'amountCents', '')::bigint, 0),
          $4,
          jsonb_strip_nulls(jsonb_build_object(
            'summary',
            COALESCE(NULLIF($11::jsonb ->> 'metadataSummary', ''), NULLIF($9, ''))
          )),
          $6
        )
        RETURNING id, created_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.created_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
    audit_event: `
      INSERT INTO audit_event (
        id,
        org_id,
        actor_id,
        action,
        target_type,
        target_id,
        metadata
      )
      VALUES (
        $1,
        $2,
        $6,
        $4,
        'audit_event',
        $1,
        jsonb_build_object('title', $3, 'detail', NULLIF($9, ''))
      )
      RETURNING id, created_at, id AS audit_event_id
    `,
    integration: `
      WITH inserted AS (
        INSERT INTO integration (id, org_id, provider, encrypted_config, state, created_by)
        VALUES ($1, $2, $3, convert_to('{}', 'utf8'), $4, $6)
        RETURNING id, updated_at
      ), ${insertAuditCte("operator_record.created")}
      SELECT inserted.id, inserted.updated_at, audit.id AS audit_event_id
      FROM inserted CROSS JOIN audit
    `,
  };

  const sql = sqlByType[recordType];

  if (!sql) {
    return actionError(
      "CONFLICT",
      `${getOperatorRecordCrudDescriptor(recordType)?.label ?? recordType} creation is not supported yet.`
    );
  }

  const values =
    recordType === "audit_event"
      ? baseValues.slice(0, 9)
      : recordType === "organization" || recordType === "contract"
        ? [...baseValues, input.moduleKey]
        : baseValues;

  return { sql, values };
}

function updateAssignments(recordType: OperatorRecordCrudType) {
  switch (recordType) {
    case "organization":
      return "legal_name = $3, display_name = $3, website = COALESCE(NULLIF($8, ''), website), state = $4";
    case "contact":
      return "full_name = $3, role = COALESCE(NULLIF($8, ''), role), signing_authority = ($4 = 'signing_authority')";
    case "alert":
      return "title = $3, state = $4";
    case "buyer_opportunity":
      return "title = $3, use_case = COALESCE(NULLIF($8, ''), use_case), modality = COALESCE(NULLIF($10::jsonb ->> 'modality', ''), modality), budget_range = budget_range || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($10::jsonb ->> 'budgetRange', ''))), timeline = COALESCE(NULLIF($10::jsonb ->> 'timeline', ''), timeline), state = $4";
    case "supplier_opportunity":
      return "title = $3, asset_summary = COALESCE(NULLIF($8, ''), asset_summary), state = $4";
    case "supplier_asset":
      return "name = $3, modality = COALESCE(NULLIF($10::jsonb ->> 'modality', ''), modality), declared_volume = declared_volume || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($10::jsonb ->> 'declaredVolume', ''))), refresh_policy = COALESCE(NULLIF($10::jsonb ->> 'refreshPolicy', ''), refresh_policy), sensitivity = COALESCE(NULLIF($10::jsonb ->> 'sensitivity', ''), sensitivity), rights_summary = rights_summary || jsonb_build_object('summary', NULLIF($8, '')), state = $4";
    case "contract":
      return "contract_type = COALESCE(NULLIF($10::jsonb ->> 'contractType', ''), contract_type), document_uri = COALESCE(NULLIF($10::jsonb ->> 'documentUri', ''), NULLIF($8, ''), document_uri), signed_at = COALESCE(NULLIF($10::jsonb ->> 'signedAt', '')::timestamptz, signed_at), starts_at = COALESCE(NULLIF($10::jsonb ->> 'startsAt', '')::timestamptz, starts_at), ends_at = COALESCE(NULLIF($10::jsonb ->> 'endsAt', '')::timestamptz, ends_at), state = $4";
    case "license_clause":
      return "permits_train = CASE WHEN NULLIF($10::jsonb ->> 'permittedUses', '') IS NULL THEN permits_train ELSE strpos(',' || regexp_replace($10::jsonb ->> 'permittedUses', '[[:space:]]+', '', 'g') || ',', ',train,') > 0 END, permits_finetune = CASE WHEN NULLIF($10::jsonb ->> 'permittedUses', '') IS NULL THEN permits_finetune ELSE strpos(',' || regexp_replace($10::jsonb ->> 'permittedUses', '[[:space:]]+', '', 'g') || ',', ',finetune,') > 0 END, permits_eval = CASE WHEN NULLIF($10::jsonb ->> 'permittedUses', '') IS NULL THEN permits_eval ELSE strpos(',' || regexp_replace($10::jsonb ->> 'permittedUses', '[[:space:]]+', '', 'g') || ',', ',eval,') > 0 END, permits_inference_commercial = CASE WHEN NULLIF($10::jsonb ->> 'permittedUses', '') IS NULL THEN permits_inference_commercial ELSE strpos(',' || regexp_replace($10::jsonb ->> 'permittedUses', '[[:space:]]+', '', 'g') || ',', ',commercial_inference,') > 0 END, permits_redistribute = CASE WHEN NULLIF($10::jsonb ->> 'permittedUses', '') IS NULL THEN permits_redistribute ELSE strpos(',' || regexp_replace($10::jsonb ->> 'permittedUses', '[[:space:]]+', '', 'g') || ',', ',redistribute,') > 0 END, exclusivity = COALESCE(NULLIF($10::jsonb ->> 'exclusivity', ''), exclusivity), geo = COALESCE((SELECT array_agg(upper(trim(value))) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'geo', ''), ''), ',') AS value WHERE trim(value) <> ''), geo), term_ends_at = COALESCE(NULLIF($10::jsonb ->> 'termEndsAt', '')::timestamptz, term_ends_at), share_alike = COALESCE(NULLIF($10::jsonb ->> 'shareAlike', '')::boolean, share_alike), notes = COALESCE(NULLIF($8, ''), notes), state = $4";
    case "consent_record":
      return "subject_ref = $3, lawful_basis = COALESCE(NULLIF($10::jsonb ->> 'lawfulBasis', ''), NULLIF($8, ''), lawful_basis), evidence_uri = COALESCE(NULLIF($10::jsonb ->> 'evidenceUri', ''), NULLIF($8, ''), evidence_uri), state = $4";
    case "dataset_brief":
      return "title = $3, requirements = requirements || jsonb_build_object('summary', NULLIF($8, '')), sensitivity_constraints = sensitivity_constraints || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($10::jsonb ->> 'sensitivityConstraints', ''))), target_formats = COALESCE((SELECT array_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'targetFormats', ''), ''), ',') AS value WHERE trim(value) <> ''), target_formats), state = $4";
    case "delivery":
      return "channel = COALESCE(NULLIF($10::jsonb ->> 'channel', ''), $3), receipt = receipt || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''), 'receiptHash', NULLIF($10::jsonb ->> 'receiptHash', ''), 'acceptanceWindowDays', NULLIF($10::jsonb ->> 'acceptanceWindowDays', '')::integer)), state = $4";
    case "subscription":
      return "cadence = COALESCE(NULLIF($10::jsonb ->> 'cadence', ''), cadence), delivery_channel = COALESCE(NULLIF($10::jsonb ->> 'deliveryChannel', ''), delivery_channel), rolling_window_versions = COALESCE(NULLIF($10::jsonb ->> 'rollingWindowVersions', '')::integer, rolling_window_versions), next_refresh_at = COALESCE(NULLIF($10::jsonb ->> 'nextRefreshAt', '')::timestamptz, next_refresh_at), retention_policy = retention_policy || jsonb_strip_nulls(jsonb_build_object('retentionDays', NULLIF($10::jsonb ->> 'retentionDays', '')::integer)), delivery_policy = delivery_policy || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''))), state = $4";
    case "delta_manifest":
      return "manifest_uri = COALESCE(NULLIF($10::jsonb ->> 'manifestUri', ''), manifest_uri), manifest_hash = COALESCE(NULLIF($10::jsonb ->> 'manifestHash', ''), manifest_hash), previous_dataset_version_id = COALESCE(NULLIF($10::jsonb ->> 'previousDatasetVersionId', ''), previous_dataset_version_id), delivery_id = COALESCE(NULLIF($10::jsonb ->> 'deliveryId', ''), delivery_id), qa_report_id = COALESCE(NULLIF($10::jsonb ->> 'qaReportId', ''), qa_report_id), added_records = COALESCE(NULLIF($10::jsonb ->> 'addedRecords', '')::bigint, added_records), updated_records = COALESCE(NULLIF($10::jsonb ->> 'updatedRecords', '')::bigint, updated_records), deleted_records = COALESCE(NULLIF($10::jsonb ->> 'deletedRecords', '')::bigint, deleted_records), tombstoned_records = COALESCE(NULLIF($10::jsonb ->> 'tombstonedRecords', '')::bigint, tombstoned_records), total_records = COALESCE(NULLIF($10::jsonb ->> 'totalRecords', '')::bigint, total_records), quality_score = COALESCE(NULLIF($10::jsonb ->> 'qualityScore', '')::numeric, quality_score), rights_reverified = COALESCE(NULLIF($10::jsonb ->> 'rightsReverified', '')::boolean, rights_reverified), privacy_verified = COALESCE(NULLIF($10::jsonb ->> 'privacyVerified', '')::boolean, privacy_verified), deletion_notice_uri = COALESCE(NULLIF($10::jsonb ->> 'deletionNoticeUri', ''), deletion_notice_uri), summary = summary || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''))), state = $4";
    case "build":
      return "title = $3, state = $4, eta_at = COALESCE(NULLIF($10::jsonb ->> 'etaAt', '')::timestamptz, eta_at), q_score = COALESCE(NULLIF($10::jsonb ->> 'qScore', '')::numeric, q_score), cost_budget_cents = COALESCE(NULLIF($10::jsonb ->> 'costBudgetCents', '')::bigint, cost_budget_cents), cost_used_cents = COALESCE(NULLIF($10::jsonb ->> 'costUsedCents', '')::bigint, cost_used_cents)";
    case "build_plan":
      return "manifest_yaml = COALESCE(NULLIF($8, ''), manifest_yaml), composed_permits = composed_permits || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($10::jsonb ->> 'permitSummary', ''))), license_blocked = COALESCE(NULLIF($10::jsonb ->> 'licenseBlocked', '')::boolean, license_blocked), state = $4";
    case "dataset":
      return "name = $3, modality = COALESCE(NULLIF($10::jsonb ->> 'modality', ''), NULLIF($8, ''), modality), state = $4";
    case "dataset_version":
      return "version_label = $3, manifest_uri = COALESCE(NULLIF($8, ''), manifest_uri), content_hash = COALESCE(NULLIF($10::jsonb ->> 'contentHash', ''), content_hash), record_count = COALESCE(NULLIF($10::jsonb ->> 'recordCount', '')::bigint, record_count), size_bytes = COALESCE(NULLIF($10::jsonb ->> 'sizeBytes', '')::bigint, size_bytes), qa_score = COALESCE(NULLIF($10::jsonb ->> 'qaScore', '')::numeric, qa_score), state = $4";
    case "modality_contract":
      return "modality = COALESCE(NULLIF($10::jsonb ->> 'modality', ''), modality), canonical_format = COALESCE(NULLIF($10::jsonb ->> 'canonicalFormat', ''), NULLIF($8, ''), canonical_format), profile_signals = COALESCE((SELECT jsonb_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'profileSignals', ''), ''), ',') AS value WHERE trim(value) <> ''), profile_signals), cleaning_operators = COALESCE((SELECT jsonb_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'cleaningOperators', ''), ''), ',') AS value WHERE trim(value) <> ''), cleaning_operators), privacy_treatments = COALESCE((SELECT jsonb_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'privacyTreatments', ''), ''), ',') AS value WHERE trim(value) <> ''), privacy_treatments), labeling_widgets = COALESCE((SELECT array_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'labelingWidgets', ''), ''), ',') AS value WHERE trim(value) <> ''), labeling_widgets), qa_dimensions = COALESCE((SELECT jsonb_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'qaDimensions', ''), ''), ',') AS value WHERE trim(value) <> ''), qa_dimensions), packaging_targets = COALESCE((SELECT array_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'packagingTargets', ''), ''), ',') AS value WHERE trim(value) <> ''), packaging_targets), state = $4";
    case "qa_report":
      return "dimensions = dimensions || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''))), composite_score = COALESCE(NULLIF($10::jsonb ->> 'compositeScore', '')::numeric, composite_score), verdict = $4";
    case "cleanlab_qa_pass":
      return "scan_strategy = COALESCE(NULLIF($10::jsonb ->> 'scanStrategy', ''), scan_strategy), state = $4, input_manifest_uri = COALESCE(NULLIF($10::jsonb ->> 'inputManifestUri', ''), input_manifest_uri), cleanlab_report_uri = COALESCE(NULLIF($10::jsonb ->> 'cleanlabReportUri', ''), cleanlab_report_uri), model_snapshot_uri = COALESCE(NULLIF($10::jsonb ->> 'modelSnapshotUri', ''), model_snapshot_uri), scanned_count = COALESCE(NULLIF($10::jsonb ->> 'scannedCount', '')::integer, scanned_count), suspected_label_errors = COALESCE(NULLIF($10::jsonb ->> 'suspectedLabelErrors', '')::integer, suspected_label_errors), estimated_error_rate = COALESCE(NULLIF($10::jsonb ->> 'estimatedErrorRate', '')::numeric, estimated_error_rate), error_rate_threshold = COALESCE(NULLIF($10::jsonb ->> 'errorRateThreshold', '')::numeric, error_rate_threshold), requeue_count = COALESCE(NULLIF($10::jsonb ->> 'requeueCount', '')::integer, requeue_count), requeue_manifest_uri = COALESCE(NULLIF($10::jsonb ->> 'requeueManifestUri', ''), requeue_manifest_uri), summary = summary || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, '')))";
    case "enrichment_manifest":
      return "enrichment_class = COALESCE(NULLIF($10::jsonb ->> 'enrichmentClass', ''), enrichment_class), added_columns = COALESCE((SELECT jsonb_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'addedColumns', ''), ''), ',') AS value WHERE trim(value) <> ''), added_columns), sources = COALESCE((SELECT jsonb_agg(trim(value)) FROM regexp_split_to_table(COALESCE(NULLIF($10::jsonb ->> 'sources', ''), ''), ',') AS value WHERE trim(value) <> ''), sources), source_license = COALESCE(NULLIF($10::jsonb ->> 'sourceLicense', ''), source_license), source_version = COALESCE(NULLIF($10::jsonb ->> 'sourceVersion', ''), source_version), computation_method = COALESCE(NULLIF($10::jsonb ->> 'computationMethod', ''), NULLIF($8, ''), computation_method), model_identity_hash = COALESCE(NULLIF($10::jsonb ->> 'modelIdentityHash', ''), model_identity_hash), prompt_template_version = COALESCE(NULLIF($10::jsonb ->> 'promptTemplateVersion', ''), prompt_template_version), reproducer_uri = COALESCE(NULLIF($10::jsonb ->> 'reproducerUri', ''), reproducer_uri), spot_check_rate = COALESCE(NULLIF($10::jsonb ->> 'spotCheckRate', '')::numeric, spot_check_rate), independence_passed = COALESCE(NULLIF($10::jsonb ->> 'independencePassed', '')::boolean, independence_passed), license_compatible = COALESCE(NULLIF($10::jsonb ->> 'licenseCompatible', '')::boolean, license_compatible), state = $4";
    case "label_batch":
      return "state = $4, queue_depth = COALESCE(NULLIF($10::jsonb ->> 'queueDepth', '')::integer, queue_depth), agreement_score = COALESCE(NULLIF($10::jsonb ->> 'agreementScore', '')::numeric, agreement_score)";
    case "active_learning_loop":
      return "strategy = COALESCE(NULLIF($10::jsonb ->> 'strategy', ''), strategy), state = $4, candidate_source_uri = COALESCE(NULLIF($10::jsonb ->> 'candidateSourceUri', ''), NULLIF($8, ''), candidate_source_uri), embedding_index_uri = COALESCE(NULLIF($10::jsonb ->> 'embeddingIndexUri', ''), embedding_index_uri), model_snapshot_uri = COALESCE(NULLIF($10::jsonb ->> 'modelSnapshotUri', ''), model_snapshot_uri), uncertainty_metric = COALESCE(NULLIF($10::jsonb ->> 'uncertaintyMetric', ''), uncertainty_metric), diversity_metric = COALESCE(NULLIF($10::jsonb ->> 'diversityMetric', ''), diversity_metric), boundary_metric = COALESCE(NULLIF($10::jsonb ->> 'boundaryMetric', ''), boundary_metric), target_sample_size = COALESCE(NULLIF($10::jsonb ->> 'targetSampleSize', '')::integer, target_sample_size), selected_count = COALESCE(NULLIF($10::jsonb ->> 'selectedCount', '')::integer, selected_count), selection_manifest_uri = COALESCE(NULLIF($10::jsonb ->> 'selectionManifestUri', ''), selection_manifest_uri), selection_summary = selection_summary || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''), 'strategy', NULLIF($10::jsonb ->> 'strategy', ''))), reviewer_routing = reviewer_routing || jsonb_strip_nulls(jsonb_build_object('policy', NULLIF($10::jsonb ->> 'reviewerRouting', '')))";
    case "dsar_request":
      return "subject_ref = $3, request_type = COALESCE(NULLIF($10::jsonb ->> 'requestType', ''), request_type), sla_due_at = CASE WHEN NULLIF($10::jsonb ->> 'slaDays', '') IS NULL THEN sla_due_at ELSE now() + make_interval(days => NULLIF($10::jsonb ->> 'slaDays', '')::integer) END, state = $4";
    case "pii_map":
      return "findings = findings || jsonb_build_object('summary', NULLIF($8, '')), treatments = treatments || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($10::jsonb ->> 'treatmentSummary', ''))), state = $4";
    case "catalogue_listing":
      return "title = $3, pricing = pricing || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''), 'priceCents', NULLIF($10::jsonb ->> 'priceCents', '')::integer, 'currency', NULLIF($10::jsonb ->> 'currency', ''), 'billingModel', NULLIF($10::jsonb ->> 'billingModel', ''))), visibility = COALESCE(NULLIF($10::jsonb ->> 'visibility', ''), visibility), sample_preview_uri = COALESCE(NULLIF($10::jsonb ->> 'samplePreviewUri', ''), sample_preview_uri), sample_preview_policy = sample_preview_policy || jsonb_strip_nulls(jsonb_build_object('gate', NULLIF($10::jsonb ->> 'previewGate', ''), 'watermark', true)), refresh_cadence = COALESCE(NULLIF($10::jsonb ->> 'refreshCadence', ''), refresh_cadence), license_tier = COALESCE(NULLIF($10::jsonb ->> 'licenseTier', ''), license_tier), state = $4";
    case "private_offer":
      return "terms = terms || jsonb_strip_nulls(jsonb_build_object('summary', NULLIF($8, ''), 'offerValueCents', NULLIF($10::jsonb ->> 'offerValueCents', '')::integer, 'currency', NULLIF($10::jsonb ->> 'currency', ''), 'expiresAt', NULLIF($10::jsonb ->> 'expiresAt', ''))), sample_preview_uri = COALESCE(NULLIF($10::jsonb ->> 'samplePreviewUri', ''), sample_preview_uri), sample_preview_policy = sample_preview_policy || jsonb_strip_nulls(jsonb_build_object('gate', NULLIF($10::jsonb ->> 'previewGate', ''), 'watermark', true)), state = $4";
    case "sample_preview_access":
      return "state = $4, nda_acknowledged_at = CASE WHEN $4 IN ('nda_acknowledged', 'approved') THEN COALESCE(nda_acknowledged_at, now()) ELSE nda_acknowledged_at END, watermark_subject = COALESCE(NULLIF($10::jsonb ->> 'watermarkSubject', ''), watermark_subject), decision_reason = COALESCE(NULLIF($10::jsonb ->> 'decisionReason', ''), NULLIF($8, ''), decision_reason), expires_at = COALESCE(NULLIF($10::jsonb ->> 'expiresAt', '')::timestamptz, expires_at), decided_by = CASE WHEN $4 IN ('approved', 'denied', 'revoked', 'expired') THEN $6 ELSE decided_by END";
    case "quote":
      return "amount_cents = COALESCE(NULLIF($10::jsonb ->> 'amountCents', '')::integer, amount_cents), currency = COALESCE(NULLIF($10::jsonb ->> 'currency', ''), currency), state = $4";
    case "invoice":
      return "stripe_invoice_id = COALESCE(NULLIF($8, ''), stripe_invoice_id), amount_cents = COALESCE(NULLIF($10::jsonb ->> 'amountCents', '')::integer, amount_cents), currency = COALESCE(NULLIF($10::jsonb ->> 'currency', ''), currency), state = $4";
    case "payout":
      return "amount_cents = COALESCE(NULLIF($10::jsonb ->> 'amountCents', '')::integer, amount_cents), currency = COALESCE(NULLIF($10::jsonb ->> 'currency', ''), currency), state = $4";
    case "run":
      return "external_run_id = COALESCE(NULLIF($10::jsonb ->> 'externalRunId', ''), NULLIF($3, ''), external_run_id), state = $4, retry_count = COALESCE(NULLIF($10::jsonb ->> 'retryCount', '')::integer, retry_count), started_at = COALESCE(NULLIF($10::jsonb ->> 'startedAt', '')::timestamptz, started_at), finished_at = COALESCE(NULLIF($10::jsonb ->> 'finishedAt', '')::timestamptz, finished_at)";
    case "integration":
      return "provider = $3, state = $4";
    case "signing_key":
      return "state = $4";
    default:
      return null;
  }
}

function buildUpdateSql(
  recordType: OperatorRecordCrudType,
  auditId: string,
  context: CurrentOperatorContext,
  input: UpdateRecordInput
): SqlMutation | ActionError {
  const spec = mutableTables[recordType as keyof typeof mutableTables];
  const assignments = updateAssignments(recordType);
  const fieldsJson = JSON.stringify(input.fields);

  if (!spec || !assignments) {
    return actionError(
      "CONFLICT",
      `${getOperatorRecordCrudDescriptor(recordType)?.label ?? recordType} cannot be edited from the Operator Console.`
    );
  }

  return {
    sql: `
      WITH updated AS (
        UPDATE ${spec.table}
        SET ${assignments}
        WHERE id = $1
          AND org_id = $2
          AND deleted_at IS NULL
          AND (
            $7::timestamptz IS NULL
            OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $7::timestamptz)
          )
        RETURNING id, updated_at
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
          $5,
          $2,
          $6,
          'operator_record.updated',
          $9,
          updated.id,
          jsonb_build_object(
            'title', $3::text,
            'detail', $8::text,
            'state', $4::text,
            'expected_updated_at', $7::text,
            'fields', $10::jsonb
          )
        FROM updated
        RETURNING id
      )
      SELECT updated.id, updated.updated_at, audit.id AS audit_event_id
      FROM updated CROSS JOIN audit
    `,
    values: [
      input.targetId,
      context.orgId,
      input.title,
      input.state,
      auditId,
      context.operatorId,
      input.expectedUpdatedAt ?? null,
      input.detail ?? "",
      recordType,
      fieldsJson,
    ],
  };
}

function buildDeleteSql(
  recordType: OperatorRecordCrudType,
  auditId: string,
  context: CurrentOperatorContext,
  input: z.infer<typeof deleteRecordSchema>
): SqlMutation | ActionError {
  const spec = mutableTables[recordType as keyof typeof mutableTables];

  if (!spec?.softDelete) {
    return actionError(
      "CONFLICT",
      `${getOperatorRecordCrudDescriptor(recordType)?.label ?? recordType} cannot be deleted from the Operator Console.`
    );
  }

  return {
    sql: `
      WITH deleted AS (
        UPDATE ${spec.table}
        SET deleted_at = now()
        WHERE id = $1
          AND org_id = $2
          AND deleted_at IS NULL
          AND (
            $5::timestamptz IS NULL
            OR date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $5::timestamptz)
          )
        RETURNING id
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
          $3,
          $2,
          $4,
          'operator_record.deleted',
          $6,
          deleted.id,
          jsonb_build_object('expected_updated_at', $5::text)
        FROM deleted
        RETURNING id
      )
      SELECT deleted.id, audit.id AS audit_event_id
      FROM deleted CROSS JOIN audit
    `,
    values: [
      input.targetId,
      context.orgId,
      auditId,
      context.operatorId,
      input.expectedUpdatedAt ?? null,
      recordType,
    ],
  };
}

function mapDbError(error: unknown) {
  if (
    error instanceof Error &&
    /violates|constraint|invalid input|foreign key/i.test(error.message)
  ) {
    return actionError("CONFLICT", error.message);
  }

  throw error;
}

export async function createOperatorRecord(
  input: unknown
): Promise<OperatorRecordMutationResult> {
  const parsed = parseInput(createRecordSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  if (!isOperatorRecordCrudType(parsed.data.recordType)) {
    return actionError("VALIDATION_ERROR", "Unsupported record type");
  }

  const supportError = validateCrudSupport(parsed.data.recordType, "create");
  if (supportError) return supportError;

  const stateError = validateState(parsed.data.recordType, parsed.data.state);
  if (stateError) return stateError;

  const fields = normalizeRecordFields(parsed.data.recordType, parsed.data.fields);
  if (isActionError(fields)) return fields;

  const evidenceError = validateM2RecordEvidence(
    parsed.data.recordType,
    parsed.data.state,
    fields
  );
  if (evidenceError) return evidenceError;

  const normalizedInput = { ...parsed.data, fields };

  const context = await getMutationContext();
  if ("error" in context) return context;

  const prefix =
    mutableTables[parsed.data.recordType as keyof typeof mutableTables]?.prefix ??
    "ae";
  const recordId = createPrefixedId(prefix);
  const auditId =
    parsed.data.recordType === "audit_event" ? recordId : createPrefixedId("ae");
  const mutation = buildCreateSql(
    normalizedInput.recordType,
    recordId,
    auditId,
    context,
    normalizedInput
  );

  if ("error" in mutation) return mutation;

  try {
    const rows = await queryRows<MutationRow & { audit_event_id: string }>(
      mutation.sql,
      mutation.values,
      {
        orgId: context.orgId,
        operatorId: context.operatorId,
        serviceRole: false,
      }
    );
    const row = rows[0];

    if (!row) {
      return actionError(
        "CONFLICT",
        "Required related record is missing for this create operation."
      );
    }

    return {
      ok: true,
      auditEventId: row.audit_event_id,
      record: buildWorkItem(
        normalizedInput.moduleKey,
        normalizedInput.recordType,
        row,
        normalizedInput.title,
        normalizedInput.detail,
        normalizedInput.state,
        normalizedInput.fields
      ),
    };
  } catch (error) {
    return mapDbError(error);
  }
}

export async function updateOperatorRecord(
  input: unknown
): Promise<OperatorRecordMutationResult> {
  const parsed = parseInput(updateRecordSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const supportError = validateCrudSupport(parsed.data.recordType, "update");
  if (supportError) return supportError;

  const stateError = validateState(parsed.data.recordType, parsed.data.state);
  if (stateError) return stateError;

  const fields = normalizeRecordFields(parsed.data.recordType, parsed.data.fields);
  if (isActionError(fields)) return fields;

  const evidenceError = validateM2RecordEvidence(
    parsed.data.recordType,
    parsed.data.state,
    fields
  );
  if (evidenceError) return evidenceError;

  const normalizedInput = { ...parsed.data, fields };

  const context = await getMutationContext();
  if ("error" in context) return context;

  const auditId = createPrefixedId("ae");
  const mutation = buildUpdateSql(
    normalizedInput.recordType,
    auditId,
    context,
    normalizedInput
  );

  if ("error" in mutation) return mutation;

  try {
    const rows = await queryRows<MutationRow & { audit_event_id: string }>(
      mutation.sql,
      mutation.values,
      {
        orgId: context.orgId,
        operatorId: context.operatorId,
        serviceRole: false,
      }
    );
    const row = rows[0];

    if (!row) {
      return actionError(
        "CONFLICT",
        `${parsed.data.recordType}/${parsed.data.targetId} changed before the edit could be applied. Refresh and retry.`
      );
    }

    return {
      ok: true,
      auditEventId: row.audit_event_id,
      record: buildWorkItem(
        normalizedInput.moduleKey,
        normalizedInput.recordType,
        row,
        normalizedInput.title,
        normalizedInput.detail,
        normalizedInput.state,
        normalizedInput.fields
      ),
    };
  } catch (error) {
    return mapDbError(error);
  }
}

export async function deleteOperatorRecord(
  input: unknown
): Promise<OperatorRecordMutationResult> {
  const parsed = parseInput(deleteRecordSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const supportError = validateCrudSupport(parsed.data.recordType, "delete");
  if (supportError) return supportError;

  const context = await getMutationContext();
  if ("error" in context) return context;

  const auditId = createPrefixedId("ae");
  const mutation = buildDeleteSql(parsed.data.recordType, auditId, context, parsed.data);

  if ("error" in mutation) return mutation;

  try {
    const rows = await queryRows<MutationRow & { audit_event_id: string }>(
      mutation.sql,
      mutation.values,
      {
        orgId: context.orgId,
        operatorId: context.operatorId,
        serviceRole: false,
      }
    );
    const row = rows[0];

    if (!row) {
      return actionError(
        "CONFLICT",
        `${parsed.data.recordType}/${parsed.data.targetId} changed before it could be deleted. Refresh and retry.`
      );
    }

    return {
      ok: true,
      auditEventId: row.audit_event_id,
      deletedRecordId: row.id,
    };
  } catch (error) {
    return mapDbError(error);
  }
}
