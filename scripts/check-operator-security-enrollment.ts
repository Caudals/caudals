import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  getResetEligibleOperators,
  isOperatorSecurityEnrollmentComplete,
  mapOperatorSecurityEnrollmentRow,
  summarizeOperatorSecurityEnrollment,
  type OperatorSecurityEnrollmentEntry,
  type OperatorSecurityEnrollmentRow,
} from "@/lib/auth/operator-security-enrollment";
import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";
import { createPrefixedId } from "@/lib/operator/ids";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const sendResets = args.has("--send-resets");
const showEmails = args.has("--show-emails");
const json = args.has("--json");
const failOnIncomplete = args.has("--fail-on-incomplete");

type ResetRequestOutcome = {
  operatorId: string;
  orgId: string | null;
  ok: boolean;
};

type ResetRequestSummary = {
  resetRequests: number;
  failedRequests: number;
  outcomes: ResetRequestOutcome[];
};

function getTargetDatabaseUrl() {
  return getDatabaseUrlFromEnv({
    missingMessage:
      "DATABASE_URL or DATABASE_URL_FILE is required for the PostgreSQL database",
  });
}

function getBaseUrl() {
  const baseUrl =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL;

  if (!baseUrl) {
    throw new Error(
      "BETTER_AUTH_URL, NEXT_PUBLIC_BETTER_AUTH_URL, or NEXT_PUBLIC_APP_URL is required when sending reset emails"
    );
  }

  return baseUrl;
}

async function main() {
  const pool = new Pool({
    connectionString: getTargetDatabaseUrl(),
    max: 1,
  });

  try {
    const rows = await fetchOperatorSecurityRows(pool);
    const operators = rows.map(mapOperatorSecurityEnrollmentRow);
    const summary = summarizeOperatorSecurityEnrollment(operators);
    const resetEligibleOperators = getResetEligibleOperators(operators);
    let resetRequests = 0;
    let failedRequests = 0;

    if (sendResets && resetEligibleOperators.length > 0) {
      const resetSummary =
        await requestPasswordResetEmails(resetEligibleOperators);
      resetRequests = resetSummary.resetRequests;
      failedRequests = resetSummary.failedRequests;
      await auditPasswordResetRequests(pool, resetSummary.outcomes);
    }

    if (json) {
      console.log(
        JSON.stringify(
          {
            summary,
            resetRequests,
            failedRequests,
            resetEligibleEmails: showEmails
              ? resetEligibleOperators.map((operator) => operator.email)
              : undefined,
          },
          null,
          2
        )
      );
    } else {
      console.log(
        [
          `operator_security total=${summary.total}`,
          `complete=${summary.complete}`,
          `action_needed=${summary.actionNeeded}`,
          `mfa=${summary.mfaEnabled}/${summary.mfaRequired}`,
          `passkey_users=${summary.passkeyUsers}/${summary.webauthnRequired}`,
          `reset_eligible=${summary.resetEligible}`,
          `reset_requests=${resetRequests}`,
          `reset_failed=${failedRequests}`,
        ].join(" ")
      );

      if (showEmails && resetEligibleOperators.length > 0) {
        console.log("reset_eligible_emails:");
        for (const operator of resetEligibleOperators) {
          console.log(`- ${operator.email}`);
        }
      }

      if (!sendResets && resetEligibleOperators.length > 0) {
        console.log(
          "Dry run only. Re-run with --send-resets to request reset links."
        );
      }
    }

    if (failOnIncomplete && !isOperatorSecurityEnrollmentComplete(summary)) {
      console.error(
        `Operator security enrollment incomplete: ${summary.actionNeeded} operator(s) still need MFA/passkey setup.`
      );
      process.exitCode = 1;
    }

    if (failedRequests > 0) {
      console.error(
        `Operator security reset requests failed: ${failedRequests} request(s).`
      );
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

async function fetchOperatorSecurityRows(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        SELECT
          set_config('app.current_org_id', '', true),
          set_config('app.current_operator_id', '', true),
          set_config('app.is_service_role', 'true', true)
      `
    );

    const { rows } = await client.query<OperatorSecurityEnrollmentRow>(`
      SELECT
        o.id,
        o.org_id AS "orgId",
        o.email::text,
        o.name,
        o.role,
        o.state,
        o.mfa_required AS "mfaRequired",
        COALESCE(u."twoFactorEnabled", false) AS "mfaEnabled",
        o.webauthn_required AS "webauthnRequired",
        COALESCE((
          SELECT count(*)::int
          FROM auth_passkey p
          WHERE p."userId" = u.id
        ), 0) AS "passkeyCount",
        (
          SELECT max(s."createdAt")
          FROM auth_session s
          WHERE s."userId" = u.id
        ) AS "lastSessionAt",
        (
          SELECT max(s."expiresAt")
          FROM auth_session s
          WHERE s."userId" = u.id
        ) AS "lastSessionExpiresAt"
      FROM "operator" o
      LEFT JOIN auth_user u ON u.email = o.email::text
      WHERE o.deleted_at IS NULL
      ORDER BY
        CASE WHEN o.role = 'admin' THEN 0 ELSE 1 END,
        o.email::text
    `);

    await client.query("COMMIT");
    return rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function requestPasswordResetEmails(
  operators: OperatorSecurityEnrollmentEntry[]
): Promise<ResetRequestSummary> {
  const baseUrl = getBaseUrl();
  const url = new URL("/api/auth/request-password-reset", baseUrl);
  const redirectTo = new URL("/auth/reset-password", baseUrl).toString();
  const outcomes: ResetRequestOutcome[] = [];

  for (const operator of operators) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: operator.email,
          redirectTo,
        }),
      });

      outcomes.push({
        operatorId: operator.id,
        orgId: operator.orgId,
        ok: response.ok,
      });
    } catch {
      outcomes.push({
        operatorId: operator.id,
        orgId: operator.orgId,
        ok: false,
      });
    }
  }

  return {
    resetRequests: outcomes.filter((outcome) => outcome.ok).length,
    failedRequests: outcomes.filter((outcome) => !outcome.ok).length,
    outcomes,
  };
}

async function auditPasswordResetRequests(
  pool: Pool,
  outcomes: ResetRequestOutcome[]
) {
  if (outcomes.length === 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        SELECT
          set_config('app.current_org_id', '', true),
          set_config('app.current_operator_id', '', true),
          set_config('app.is_service_role', 'true', true)
      `
    );

    const actorId = await resolveAuditActorId(client);
    const outcomesByOrg = new Map<string | null, ResetRequestOutcome[]>();

    for (const outcome of outcomes) {
      const orgOutcomes = outcomesByOrg.get(outcome.orgId) ?? [];
      orgOutcomes.push(outcome);
      outcomesByOrg.set(outcome.orgId, orgOutcomes);
    }

    for (const [orgId, orgOutcomes] of outcomesByOrg.entries()) {
      const resetRequests = orgOutcomes.filter((outcome) => outcome.ok).length;
      const failedRequests = orgOutcomes.filter((outcome) => !outcome.ok)
        .length;
      const targetId = orgId ?? "operator_security";

      await client.query(
        `
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
            $3,
            'operator_security.reset_links_requested',
            'operator_security',
            $4,
            $5::jsonb
          )
        `,
        [
          createPrefixedId("ae"),
          orgId,
          actorId,
          targetId,
          JSON.stringify({
            reset_requested_count: resetRequests,
            reset_failed_count: failedRequests,
            target_operator_ids: orgOutcomes.map(
              (outcome) => outcome.operatorId
            ),
            source: "operator_security_status_cli",
          }),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function resolveAuditActorId(
  client: Pick<Pool, "query"> | { query: Pool["query"] }
) {
  const configuredActorId = process.env.OPERATOR_CONSOLE_OPERATOR_ID?.trim();

  if (configuredActorId) {
    const { rows } = await client.query<{ id: string }>(
      `
        SELECT id
        FROM "operator"
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [configuredActorId]
    );

    if (rows[0]) {
      return rows[0].id;
    }
  }

  const { rows } = await client.query<{ id: string }>(
    `
      SELECT id
      FROM "operator"
      WHERE deleted_at IS NULL
      ORDER BY
        CASE WHEN role = 'admin' THEN 0 ELSE 1 END,
        created_at
      LIMIT 1
    `
  );

  return rows[0]?.id ?? null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
