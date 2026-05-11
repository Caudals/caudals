import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

import {
  getResetEligibleOperators,
  mapOperatorSecurityEnrollmentRow,
  summarizeOperatorSecurityEnrollment,
  type OperatorSecurityEnrollmentRow,
} from "@/lib/auth/operator-security-enrollment";
import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const sendResets = args.has("--send-resets");
const showEmails = args.has("--show-emails");
const json = args.has("--json");

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

    if (sendResets && resetEligibleOperators.length > 0) {
      resetRequests = await requestPasswordResetEmails(resetEligibleOperators);
    }

    if (json) {
      console.log(
        JSON.stringify(
          {
            summary,
            resetRequests,
            resetEligibleEmails: showEmails
              ? resetEligibleOperators.map((operator) => operator.email)
              : undefined,
          },
          null,
          2
        )
      );
      return;
    }

    console.log(
      [
        `operator_security total=${summary.total}`,
        `complete=${summary.complete}`,
        `action_needed=${summary.actionNeeded}`,
        `mfa=${summary.mfaEnabled}/${summary.mfaRequired}`,
        `passkey_users=${summary.passkeyUsers}/${summary.webauthnRequired}`,
        `reset_eligible=${summary.resetEligible}`,
        `reset_requests=${resetRequests}`,
      ].join(" ")
    );

    if (showEmails && resetEligibleOperators.length > 0) {
      console.log("reset_eligible_emails:");
      for (const operator of resetEligibleOperators) {
        console.log(`- ${operator.email}`);
      }
    }

    if (!sendResets && resetEligibleOperators.length > 0) {
      console.log("Dry run only. Re-run with --send-resets to request reset links.");
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
  operators: { email: string }[]
) {
  const baseUrl = getBaseUrl();
  const url = new URL("/api/auth/request-password-reset", baseUrl);
  const redirectTo = new URL("/auth/reset-password", baseUrl).toString();
  let sent = 0;

  for (const operator of operators) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: operator.email,
        redirectTo,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Password-reset request failed with HTTP ${response.status}`
      );
    }

    sent += 1;
  }

  return sent;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
