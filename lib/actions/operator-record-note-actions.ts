"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { queryRows } from "@/lib/db/client";
import { createPrefixedId } from "@/lib/operator/ids";
import {
  operatorModuleKeys,
  type OperatorModuleKey,
} from "@/lib/operator/console-snapshot";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";

const moduleKeySchema = z.enum(operatorModuleKeys);

const noteTargetSchema = z.object({
  moduleKey: moduleKeySchema,
  targetType: z.string().trim().min(1).max(80),
  targetId: z.string().trim().min(4).max(80),
});

const listNotesSchema = noteTargetSchema;

const createNoteSchema = noteTargetSchema.extend({
  body: z.string().trim().min(1).max(2000),
});

const updateNoteSchema = z.object({
  noteId: z.string().trim().min(4).max(80),
  body: z.string().trim().min(1).max(2000),
});

const deleteNoteSchema = z.object({
  noteId: z.string().trim().min(4).max(80),
});

type OperatorRecordNoteRow = {
  id: string;
  module_key: OperatorModuleKey;
  target_type: string;
  target_id: string;
  body: string;
  author: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  audit_event_id?: string | null;
};

export type OperatorRecordNote = {
  id: string;
  moduleKey: OperatorModuleKey;
  targetType: string;
  targetId: string;
  body: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  auditEventId?: string | null;
};

export type OperatorRecordNotesResult =
  | { ok: true; notes: OperatorRecordNote[] }
  | ActionError;

export type OperatorRecordNoteMutationResult =
  | { ok: true; note: OperatorRecordNote }
  | { ok: true; deletedNoteId: string }
  | ActionError;

function normalizeDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : value;
}

function mapNoteRow(row: OperatorRecordNoteRow): OperatorRecordNote {
  return {
    id: row.id,
    moduleKey: row.module_key,
    targetType: row.target_type,
    targetId: row.target_id,
    body: row.body,
    author: row.author ?? "system",
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
    auditEventId: row.audit_event_id,
  };
}

export async function listOperatorRecordNotes(
  input: unknown
): Promise<OperatorRecordNotesResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  const parsed = parseInput(listNotesSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const rows = await queryRows<OperatorRecordNoteRow>(
    `
      SELECT
        n.id,
        n.module_key,
        n.target_type,
        n.target_id,
        n.body,
        o.email::text AS author,
        n.created_at,
        n.updated_at
      FROM operator_record_note n
      LEFT JOIN "operator" o ON o.id = n.created_by
      WHERE n.org_id = $1
        AND n.module_key = $2
        AND n.target_type = $3
        AND n.target_id = $4
        AND n.deleted_at IS NULL
      ORDER BY n.created_at DESC
      LIMIT 10
    `,
    [
      orgId,
      parsed.data.moduleKey,
      parsed.data.targetType,
      parsed.data.targetId,
    ],
    {
      orgId,
      operatorId: session.operator.id,
      serviceRole: false,
    }
  );

  return {
    ok: true,
    notes: rows.map(mapNoteRow),
  };
}

export async function createOperatorRecordNote(
  input: unknown
): Promise<OperatorRecordNoteMutationResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  const parsed = parseInput(createNoteSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const noteId = createPrefixedId("on");
  const auditId = createPrefixedId("ae");
  const rows = await queryRows<OperatorRecordNoteRow>(
    `
      WITH inserted AS (
        INSERT INTO operator_record_note (
          id,
          org_id,
          module_key,
          target_type,
          target_id,
          body,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        RETURNING id, module_key, target_type, target_id, body, created_at, updated_at
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
          $8,
          $2,
          $7,
          'operator_record_note.created',
          target_type,
          target_id,
          jsonb_build_object(
            'note_id', id,
            'module_key', module_key
          )
        FROM inserted
        RETURNING id
      )
      SELECT inserted.*, $9::text AS author, audit.id AS audit_event_id
      FROM inserted
      CROSS JOIN audit
    `,
    [
      noteId,
      orgId,
      parsed.data.moduleKey,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.body,
      session.operator.id,
      auditId,
      session.operator.email,
    ],
    {
      orgId,
      operatorId: session.operator.id,
      serviceRole: false,
    }
  );
  const row = rows[0];

  if (!row) {
    return actionError("DB_ERROR", "Operator note was not created");
  }

  revalidatePath("/admin");

  return {
    ok: true,
    note: mapNoteRow(row),
  };
}

export async function updateOperatorRecordNote(
  input: unknown
): Promise<OperatorRecordNoteMutationResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  const parsed = parseInput(updateNoteSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const auditId = createPrefixedId("ae");
  const rows = await queryRows<OperatorRecordNoteRow>(
    `
      WITH updated AS (
        UPDATE operator_record_note
        SET body = $3, updated_by = $4
        WHERE id = $1
          AND org_id = $2
          AND deleted_at IS NULL
        RETURNING id, module_key, target_type, target_id, body, created_at, updated_at
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
          $4,
          'operator_record_note.updated',
          target_type,
          target_id,
          jsonb_build_object(
            'note_id', id,
            'module_key', module_key
          )
        FROM updated
        RETURNING id
      )
      SELECT updated.*, $6::text AS author, audit.id AS audit_event_id
      FROM updated
      CROSS JOIN audit
    `,
    [
      parsed.data.noteId,
      orgId,
      parsed.data.body,
      session.operator.id,
      auditId,
      session.operator.email,
    ],
    {
      orgId,
      operatorId: session.operator.id,
      serviceRole: false,
    }
  );
  const row = rows[0];

  if (!row) {
    return actionError("NOT_FOUND", "Operator note was not found");
  }

  revalidatePath("/admin");

  return {
    ok: true,
    note: mapNoteRow(row),
  };
}

export async function deleteOperatorRecordNote(
  input: unknown
): Promise<OperatorRecordNoteMutationResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  const parsed = parseInput(deleteNoteSchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const auditId = createPrefixedId("ae");
  const rows = await queryRows<{ id: string }>(
    `
      WITH deleted AS (
        UPDATE operator_record_note
        SET deleted_at = now(), deleted_by = $3, updated_by = $3
        WHERE id = $1
          AND org_id = $2
          AND deleted_at IS NULL
        RETURNING id, module_key, target_type, target_id
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
          $4,
          $2,
          $3,
          'operator_record_note.deleted',
          target_type,
          target_id,
          jsonb_build_object(
            'note_id', id,
            'module_key', module_key
          )
        FROM deleted
        RETURNING id
      )
      SELECT deleted.id
      FROM deleted
      CROSS JOIN audit
    `,
    [parsed.data.noteId, orgId, session.operator.id, auditId],
    {
      orgId,
      operatorId: session.operator.id,
      serviceRole: false,
    }
  );

  if (!rows[0]) {
    return actionError("NOT_FOUND", "Operator note was not found");
  }

  revalidatePath("/admin");

  return {
    ok: true,
    deletedNoteId: rows[0].id,
  };
}
