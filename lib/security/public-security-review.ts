import "server-only";

import {
  queryRows,
  type OperatorDbSession,
  type QueryValue,
} from "@/lib/db/client";

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
  const rows = await query<SecurityReviewArtifactRow>(
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

  return {
    questionnaire,
    reviewPacket,
    updatedAt: latestIso(rows.map((row) => row.updatedAt)),
    reviewDueAt: earliestIso(rows.map((row) => row.reviewDueAt)),
  };
}
