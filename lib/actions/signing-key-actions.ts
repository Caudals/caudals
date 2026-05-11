"use server";

import {
  createCipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireCurrentOperator } from "@/lib/auth/operator-session";
import { queryRows } from "@/lib/db/client";
import { getSecretEnvValue } from "@/lib/env/secrets";
import { createPrefixedId } from "@/lib/operator/ids";
import {
  actionError,
  parseInput,
  type ActionError,
} from "@/lib/validators/action-envelope";

const createSigningKeySchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

const signingKeyRoles = new Set(["admin", "data_engineer"]);

type SigningKeyInsertRow = {
  id: string;
  public_key: string;
  algorithm: "Ed25519";
  state: "active" | "retired" | "revoked";
  created_at: string | Date;
  audit_event_id?: string | null;
};

export type CreatedSigningKey = {
  id: string;
  publicKey: string;
  publicKeyFingerprint: string;
  algorithm: "Ed25519";
  state: "active" | "retired" | "revoked";
  createdAt: string;
  auditEventId?: string | null;
};

export type CreateSigningKeyResult =
  | { ok: true; signingKey: CreatedSigningKey }
  | ActionError;

function canManageSigningKeys(role: string) {
  return signingKeyRoles.has(role);
}

function getSigningKeyEncryptionSecret() {
  const secret =
    getSecretEnvValue("SIGNING_KEY_ENCRYPTION_SECRET") ??
    getSecretEnvValue("BETTER_AUTH_SECRET", {
      missingMessage:
        "SIGNING_KEY_ENCRYPTION_SECRET or BETTER_AUTH_SECRET is required to encrypt signing keys",
    });

  if (!secret) {
    throw new Error(
      "SIGNING_KEY_ENCRYPTION_SECRET or BETTER_AUTH_SECRET is required to encrypt signing keys"
    );
  }

  return secret;
}

function publicKeyFingerprint(publicKey: string) {
  return createHash("sha256").update(publicKey).digest("base64url");
}

function encryptPrivateKey(privateKeyPem: string, signingKeyId: string) {
  const secret = getSigningKeyEncryptionSecret();
  const key = createHash("sha256").update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const aad = Buffer.from(`signing_key:${signingKeyId}`);

  cipher.setAAD(aad);

  const encrypted = Buffer.concat([
    cipher.update(privateKeyPem, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return Buffer.from(
    JSON.stringify({
      v: 1,
      alg: "aes-256-gcm",
      aad: aad.toString("base64url"),
      iv: iv.toString("base64url"),
      tag: tag.toString("base64url"),
      ciphertext: encrypted.toString("base64url"),
    }),
    "utf8"
  );
}

function mapSigningKeyRow(
  row: SigningKeyInsertRow,
  fingerprint: string
): CreatedSigningKey {
  return {
    id: row.id,
    publicKey: row.public_key,
    publicKeyFingerprint: fingerprint,
    algorithm: row.algorithm,
    state: row.state,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    auditEventId: row.audit_event_id,
  };
}

export async function createOperatorSigningKey(
  input: unknown
): Promise<CreateSigningKeyResult> {
  const session = await requireCurrentOperator();
  const orgId = session.operator.orgId;

  if (!orgId) {
    return actionError(
      "CONFLICT",
      "Current operator is not attached to an organization"
    );
  }

  if (!canManageSigningKeys(session.operator.role)) {
    return actionError(
      "FORBIDDEN",
      "Only admin and data engineer operators can create signing keys"
    );
  }

  const parsed = parseInput(createSigningKeySchema, input);
  if (!parsed.success) {
    return parsed.error;
  }

  const keyId = createPrefixedId("sk");
  const auditId = createPrefixedId("ae");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });
  const fingerprint = publicKeyFingerprint(publicKey);
  const encryptedPrivateKey = encryptPrivateKey(privateKey, keyId);
  const rows = await queryRows<SigningKeyInsertRow>(
    `
      WITH inserted AS (
        INSERT INTO signing_key (
          id,
          org_id,
          public_key,
          encrypted_private_key,
          algorithm,
          created_by
        )
        VALUES ($1, $2, $3, $4, 'Ed25519', $5)
        RETURNING id, public_key, algorithm, state, created_at
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
          $2,
          $5,
          'signing_key.created',
          'signing_key',
          id,
          jsonb_build_object(
            'reason', $7,
            'algorithm', algorithm,
            'public_key_fingerprint', $8
          )
        FROM inserted
        RETURNING id
      )
      SELECT inserted.*, audit.id AS audit_event_id
      FROM inserted
      CROSS JOIN audit
    `,
    [
      keyId,
      orgId,
      publicKey,
      encryptedPrivateKey,
      session.operator.id,
      auditId,
      parsed.data.reason,
      fingerprint,
    ],
    {
      orgId,
      operatorId: session.operator.id,
      serviceRole: true,
    }
  );
  const row = rows[0];

  if (!row) {
    return actionError("DB_ERROR", "Signing key was not created");
  }

  revalidatePath("/admin");

  return {
    ok: true,
    signingKey: mapSigningKeyRow(row, fingerprint),
  };
}
