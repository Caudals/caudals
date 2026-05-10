import { config as loadEnv } from "dotenv";
import { Pool, type PoolClient } from "pg";

import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";
import {
  mapLegacyAbuseRateLimit,
  mapLegacyProductAnalyticsEvent,
  mapLegacyStripeWebhookEvent,
  mapLegacyWaitlistSignup,
  type LegacyAbuseRateLimitRow,
  type LegacyProductAnalyticsEventRow,
  type LegacyStripeWebhookEventRow,
  type LegacyWaitlistSignupRow,
  type MigratedAbuseRateLimit,
  type MigratedProductAnalyticsEvent,
  type MigratedStripeWebhookEvent,
  type MigratedWaitlistSignup,
} from "@/lib/migrations/public-funnel-data";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply") || process.env.MIGRATE_PUBLIC_FUNNEL_APPLY === "true";

function getSourceDatabaseUrl() {
  const databaseUrl =
    process.env.LEGACY_SUPABASE_DATABASE_URL ??
    process.env.SUPABASE_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "LEGACY_SUPABASE_DATABASE_URL or SUPABASE_DATABASE_URL is required"
    );
  }

  return databaseUrl;
}

function getTargetDatabaseUrl() {
  return getDatabaseUrlFromEnv({
    missingMessage:
      "DATABASE_URL or DATABASE_URL_FILE is required for the target PostgreSQL database",
  });
}

async function main() {
  const sourcePool = new Pool({
    connectionString: getSourceDatabaseUrl(),
    max: 1,
  });
  let targetPool: Pool | null = null;

  try {
    const legacy = await fetchLegacyPublicFunnelRows(sourcePool);
    const migrated = {
      waitlistSignups: legacy.waitlistSignups.map(mapLegacyWaitlistSignup),
      productAnalyticsEvents: legacy.productAnalyticsEvents.map(
        mapLegacyProductAnalyticsEvent
      ),
      stripeWebhookEvents: legacy.stripeWebhookEvents.map(
        mapLegacyStripeWebhookEvent
      ),
      abuseRateLimits: legacy.abuseRateLimits.map(mapLegacyAbuseRateLimit),
    };

    console.log(
      [
        `Prepared ${migrated.waitlistSignups.length} waitlist signups`,
        `${migrated.productAnalyticsEvents.length} analytics events`,
        `${migrated.stripeWebhookEvents.length} Stripe webhook events`,
        `${migrated.abuseRateLimits.length} abuse rate-limit rows`,
      ].join("; ") + "."
    );

    if (!apply) {
      console.log("Dry run only. Re-run with --apply to write target rows.");
      return;
    }

    targetPool = new Pool({
      connectionString: getTargetDatabaseUrl(),
      max: 1,
    });
    const targetClient = await targetPool.connect();
    try {
      await targetClient.query("BEGIN");
      await upsertWaitlistSignups(targetClient, migrated.waitlistSignups);
      await upsertProductAnalyticsEvents(
        targetClient,
        migrated.productAnalyticsEvents
      );
      await upsertStripeWebhookEvents(targetClient, migrated.stripeWebhookEvents);
      await upsertAbuseRateLimits(targetClient, migrated.abuseRateLimits);
      await targetClient.query("COMMIT");
    } catch (error) {
      await targetClient.query("ROLLBACK");
      throw error;
    } finally {
      targetClient.release();
    }

    console.log("Migrated public funnel data into Better Auth/PostgreSQL target.");
  } finally {
    await sourcePool.end();
    await targetPool?.end();
  }
}

async function fetchLegacyPublicFunnelRows(pool: Pool) {
  const [
    waitlistSignups,
    productAnalyticsEvents,
    stripeWebhookEvents,
    abuseRateLimits,
  ] = await Promise.all([
    fetchWaitlistSignups(pool),
    fetchProductAnalyticsEvents(pool),
    fetchStripeWebhookEvents(pool),
    fetchAbuseRateLimits(pool),
  ]);

  return {
    waitlistSignups,
    productAnalyticsEvents,
    stripeWebhookEvents,
    abuseRateLimits,
  };
}

async function fetchWaitlistSignups(pool: Pool) {
  const { rows } = await pool.query<{
    id: string;
    full_name: string | null;
    email: string;
    company: string | null;
    use_case: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
    last_notified_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(`
    SELECT
      id::text, full_name, email::text, company, use_case, status::text,
      metadata, last_notified_at, created_at, updated_at
    FROM public.waitlist_signups
    ORDER BY created_at, id
  `);

  return rows.map(
    (row): LegacyWaitlistSignupRow => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      company: row.company,
      useCase: row.use_case,
      status: row.status,
      metadata: row.metadata,
      lastNotifiedAt: row.last_notified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  );
}

async function fetchProductAnalyticsEvents(pool: Pool) {
  const { rows } = await pool.query<{
    id: string;
    event_name: string;
    event_category: string;
    user_id: string | null;
    user_role: string | null;
    session_id: string | null;
    path: string | null;
    source: string;
    metadata: Record<string, unknown> | null;
    occurred_at: Date;
    created_at: Date;
  }>(`
    SELECT
      id::text, event_name, event_category, user_id::text, user_role,
      session_id, path, source, metadata, occurred_at, created_at
    FROM public.product_analytics_events
    ORDER BY occurred_at, id
  `);

  return rows.map(
    (row): LegacyProductAnalyticsEventRow => ({
      id: row.id,
      eventName: row.event_name,
      eventCategory: row.event_category,
      userId: row.user_id,
      userRole: row.user_role,
      sessionId: row.session_id,
      path: row.path,
      source: row.source,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
      createdAt: row.created_at,
    })
  );
}

async function fetchStripeWebhookEvents(pool: Pool) {
  const { rows } = await pool.query<{
    stripe_event_id: string;
    event_type: string;
    processing_state: string;
    payload: Record<string, unknown> | null;
    received_at: Date;
    processed_at: Date | null;
    last_error: string | null;
  }>(`
    SELECT
      stripe_event_id, event_type, processing_state, payload,
      received_at, processed_at, last_error
    FROM public.stripe_webhook_events
    ORDER BY received_at, stripe_event_id
  `);

  return rows.map(
    (row): LegacyStripeWebhookEventRow => ({
      stripeEventId: row.stripe_event_id,
      eventType: row.event_type,
      processingState: row.processing_state,
      payload: row.payload,
      receivedAt: row.received_at,
      processedAt: row.processed_at,
      lastError: row.last_error,
    })
  );
}

async function fetchAbuseRateLimits(pool: Pool) {
  const { rows } = await pool.query<{
    key: string;
    count: number;
    reset_at: Date;
    updated_at: Date;
  }>(`
    SELECT key, count, reset_at, updated_at
    FROM public.abuse_rate_limits
    ORDER BY key
  `);

  return rows.map(
    (row): LegacyAbuseRateLimitRow => ({
      key: row.key,
      count: row.count,
      resetAt: row.reset_at,
      updatedAt: row.updated_at,
    })
  );
}

async function upsertWaitlistSignups(
  client: PoolClient,
  rows: MigratedWaitlistSignup[]
) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO waitlist_signup (
          id, full_name, email, company, use_case, status, metadata,
          last_notified_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
        ON CONFLICT (email) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          company = EXCLUDED.company,
          use_case = EXCLUDED.use_case,
          status = EXCLUDED.status,
          metadata = EXCLUDED.metadata,
          last_notified_at = EXCLUDED.last_notified_at
      `,
      [
        row.id,
        row.fullName,
        row.email,
        row.company,
        row.useCase,
        row.status,
        JSON.stringify(row.metadata),
        row.lastNotifiedAt,
        row.createdAt,
        row.updatedAt,
      ]
    );
  }
}

async function upsertProductAnalyticsEvents(
  client: PoolClient,
  rows: MigratedProductAnalyticsEvent[]
) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO product_analytics_event (
          id, event_name, event_category, user_id, user_role, session_id,
          path, source, metadata, occurred_at, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          event_name = EXCLUDED.event_name,
          event_category = EXCLUDED.event_category,
          user_id = EXCLUDED.user_id,
          user_role = EXCLUDED.user_role,
          session_id = EXCLUDED.session_id,
          path = EXCLUDED.path,
          source = EXCLUDED.source,
          metadata = EXCLUDED.metadata,
          occurred_at = EXCLUDED.occurred_at,
          created_at = EXCLUDED.created_at
      `,
      [
        row.id,
        row.eventName,
        row.eventCategory,
        row.userId,
        row.userRole,
        row.sessionId,
        row.path,
        row.source,
        JSON.stringify(row.metadata),
        row.occurredAt,
        row.createdAt,
      ]
    );
  }
}

async function upsertStripeWebhookEvents(
  client: PoolClient,
  rows: MigratedStripeWebhookEvent[]
) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO stripe_webhook_event (
          stripe_event_id, event_type, processing_state, payload,
          received_at, processed_at, last_error
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
        ON CONFLICT (stripe_event_id) DO UPDATE SET
          event_type = EXCLUDED.event_type,
          processing_state = EXCLUDED.processing_state,
          payload = EXCLUDED.payload,
          received_at = EXCLUDED.received_at,
          processed_at = EXCLUDED.processed_at,
          last_error = EXCLUDED.last_error
      `,
      [
        row.stripeEventId,
        row.eventType,
        row.processingState,
        JSON.stringify(row.payload),
        row.receivedAt,
        row.processedAt,
        row.lastError,
      ]
    );
  }
}

async function upsertAbuseRateLimits(
  client: PoolClient,
  rows: MigratedAbuseRateLimit[]
) {
  for (const row of rows) {
    await client.query(
      `
        INSERT INTO abuse_rate_limit (key, count, reset_at, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key) DO UPDATE SET
          count = EXCLUDED.count,
          reset_at = EXCLUDED.reset_at,
          updated_at = EXCLUDED.updated_at
      `,
      [row.key, row.count, row.resetAt, row.updatedAt]
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
