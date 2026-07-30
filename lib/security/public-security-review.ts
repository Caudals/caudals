import "server-only";

import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";
import { logWarn } from "@/lib/security/structured-logger";

const DEFAULT_PUBLIC_SECURITY_ORG_ID = "or_01J20000000000000000000001";

type QueryRows = <T extends Record<string, unknown>>(
  sql: string,
  values?: QueryValue[],
  session?: OperatorDbSession,
) => Promise<T[]>;

type SecurityReviewArtifactRow = {
  id: string;
  artifactKey: string;
  artifactType:
    | "questionnaire_answer"
    | "dpa_review_path"
    | "evidence_packet_item"
    | "readiness_caveat";
  title: string;
  question: string | null;
  answer: string;
  summary: string;
  controlFamily: string;
  controlRefs: string[] | null;
  evidenceRefs: Record<string, unknown>[] | string | null;
  ownerTeam: string;
  displayOrder: number | string;
  updatedAt: string | Date;
  reviewDueAt: string | Date | null;
};

export type PublicSecurityReviewQuestion = {
  id: string;
  key: string;
  question: string;
  answer: string;
  controlFamily: string;
  controlRefs: string[];
};

export type PublicSecurityReviewPacketItem = {
  id: string;
  key: string;
  title: string;
  summary: string;
  artifactType: SecurityReviewArtifactRow["artifactType"];
};

export type PublicSecurityReviewData = {
  questionnaire: PublicSecurityReviewQuestion[];
  reviewPacket: PublicSecurityReviewPacketItem[];
  updatedAt: string | null;
  reviewDueAt: string | null;
};

// Curated static fallback that mirrors the published seed rows from
// db/migrations/026_security_review_library.sql. The public /security page is a
// buyer trust surface and must never 500 (or render blank) when its optional
// DB-backed enrichment is unavailable — e.g. migration 026 not applied, an
// empty/unreachable database, or no published artifacts for the configured
// tenant org. In those cases we serve this evidence so the page still returns
// 200 with valid content.
export const FALLBACK_PUBLIC_SECURITY_REVIEW: PublicSecurityReviewData = {
  questionnaire: [
    {
      id: "sr_fallback_buyer_supplier_data_isolation",
      key: "buyer_supplier_data_isolation",
      question: "How is buyer and supplier data isolated?",
      answer:
        "Production data access is scoped through Postgres row-level security and server-side session context. Public routes never expose operator-only tables.",
      controlFamily: "identity_access",
      controlRefs: ["Postgres RLS", "Better Auth session"],
    },
    {
      id: "sr_fallback_dataset_release_evidence",
      key: "dataset_release_evidence",
      question: "What evidence is attached to a dataset release?",
      answer:
        "Release bundles include package manifests, Croissant JSON-LD, EU AI Act Article 10 notes, validation status, and QA evidence before a delivery is approved.",
      controlFamily: "data_protection",
      controlRefs: [
        "release_documentation_bundle",
        "Croissant",
        "EU AI Act Article 10",
      ],
    },
    {
      id: "sr_fallback_incident_routing",
      key: "incident_routing",
      question: "How are incidents routed?",
      answer:
        "Operators open escalation cases for privacy, provenance, supplier, buyer, security, or platform events. Each case maps to a runbook and creates alert plus audit evidence.",
      controlFamily: "incident_response",
      controlRefs: ["escalation_case", "runbook", "audit_event"],
    },
    {
      id: "sr_fallback_formal_review_gates",
      key: "formal_review_gates",
      question: "What is still gated before formal security review?",
      answer:
        "External error delivery and on-call paging are code-ready but require production credentials before they can be marked live, and remain tracked as open readiness items.",
      controlFamily: "observability",
      controlRefs: ["SENTRY_DSN", "Alertmanager", "PagerDuty"],
    },
  ],
  reviewPacket: [
    {
      id: "sr_fallback_security_posture_summary",
      key: "security_posture_summary",
      title: "Security posture summary",
      summary:
        "Public summary of implemented controls, open readiness caveats, and security-review routing.",
      artifactType: "evidence_packet_item",
    },
    {
      id: "sr_fallback_standard_dpa_review_path",
      key: "standard_dpa_review_path",
      title: "Standard DPA review path",
      summary:
        "DPA requests are routed through contact intake for operator review before any buyer-specific legal terms are shared.",
      artifactType: "dpa_review_path",
    },
    {
      id: "sr_fallback_soc2_iso_scope",
      key: "soc2_iso_scope",
      title: "SOC 2 and ISO 27001 control scope",
      summary:
        "Control scope, framework mappings, owners, and evidence links are available for qualified security reviews.",
      artifactType: "evidence_packet_item",
    },
    {
      id: "sr_fallback_dataset_provenance_pii_notes",
      key: "dataset_provenance_pii_notes",
      title: "Dataset provenance and PII handling notes",
      summary:
        "Dataset review packets include provenance, consent, PII handling, license, and QA evidence.",
      artifactType: "evidence_packet_item",
    },
    {
      id: "sr_fallback_incident_response_runbooks",
      key: "incident_response_runbooks",
      title: "Incident response and escalation runbooks",
      summary:
        "Canonical runbooks cover supplier, buyer, privacy, rights, platform, and security escalation paths.",
      artifactType: "evidence_packet_item",
    },
  ],
  updatedAt: null,
  reviewDueAt: null,
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
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

function getPublicSecuritySession(): OperatorDbSession {
  return {
    orgId:
      process.env.PUBLIC_SECURITY_REVIEW_ORG_ID ??
      process.env.CAUDALS_TENANT_ORG_ID ??
      DEFAULT_PUBLIC_SECURITY_ORG_ID,
    serviceRole: true,
  };
}

function mapQuestion(row: SecurityReviewArtifactRow): PublicSecurityReviewQuestion {
  return {
    id: row.id,
    key: row.artifactKey,
    question: row.question?.trim() || row.title,
    answer: row.answer,
    controlFamily: row.controlFamily,
    controlRefs: toStringArray(row.controlRefs),
  };
}

function mapPacketItem(
  row: SecurityReviewArtifactRow,
): PublicSecurityReviewPacketItem {
  return {
    id: row.id,
    key: row.artifactKey,
    title: row.title,
    summary: row.summary || row.answer,
    artifactType: row.artifactType,
  };
}

function latestIso(values: Array<string | Date | null | undefined>) {
  const timestamps = values
    .map((value) => {
      const iso = toIsoString(value);
      return iso ? new Date(iso).getTime() : Number.NaN;
    })
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function earliestIso(values: Array<string | Date | null | undefined>) {
  const timestamps = values
    .map((value) => {
      const iso = toIsoString(value);
      return iso ? new Date(iso).getTime() : Number.NaN;
    })
    .filter(Number.isFinite);

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.min(...timestamps)).toISOString();
}

export async function getPublicSecurityReviewData(
  query: QueryRows = queryRows,
): Promise<PublicSecurityReviewData> {
  const session = getPublicSecuritySession();

  let rows: SecurityReviewArtifactRow[];
  try {
    rows = await query<SecurityReviewArtifactRow>(
      `
      SELECT
        id,
        artifact_key AS "artifactKey",
        artifact_type AS "artifactType",
        title,
        question,
        answer,
        summary,
        control_family AS "controlFamily",
        control_refs AS "controlRefs",
        evidence_refs AS "evidenceRefs",
        owner_team AS "ownerTeam",
        display_order AS "displayOrder",
        updated_at AS "updatedAt",
        review_due_at AS "reviewDueAt"
      FROM security_review_artifact
      WHERE deleted_at IS NULL
        AND org_id = $1
        AND audience = 'public'
        AND state = 'published'
      ORDER BY display_order ASC, title ASC
      LIMIT 24
    `,
      [session.orgId],
      session,
    );
  } catch (error) {
    // Never let the public trust page 500 because the DB-backed library is
    // unavailable (missing migration 026, empty/unreachable DATABASE_URL, etc.).
    logWarn("public_security_review.query_failed", {
      orgId: session.orgId,
      error,
    });
    return FALLBACK_PUBLIC_SECURITY_REVIEW;
  }

  const questionnaire = rows
    .filter(
      (row) =>
        row.artifactType === "questionnaire_answer" ||
        row.artifactType === "readiness_caveat",
    )
    .map(mapQuestion);
  const reviewPacket = rows
    .filter(
      (row) =>
        row.artifactType === "evidence_packet_item" ||
        row.artifactType === "dpa_review_path",
    )
    .map(mapPacketItem);

  // The table exists but holds no published public artifacts for this tenant
  // (e.g. seed org differs from the configured CAUDALS_TENANT_ORG_ID). Serve the
  // curated fallback so the page renders valid content instead of blank cards.
  if (questionnaire.length === 0 && reviewPacket.length === 0) {
    return FALLBACK_PUBLIC_SECURITY_REVIEW;
  }

  return {
    questionnaire,
    reviewPacket,
    updatedAt: latestIso(rows.map((row) => row.updatedAt)),
    reviewDueAt: earliestIso(rows.map((row) => row.reviewDueAt)),
  };
}
