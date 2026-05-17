import { Buffer } from "node:buffer";
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";

import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";
import { buildReleaseDocumentationBundle } from "@/lib/operator/release-documentation";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export const FIXTURE_OPERATOR_EMAIL = "fixture.admin@caudals.local";
export const FIXTURE_BUYER_EMAIL = "buyer.fixture@caudals.local";
export const FIXTURE_SUPPLIER_EMAIL = "supplier.fixture@caudals.local";
export const FIXTURE_OPERATOR_PASSWORD =
  process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";

const FIXTURE_CREATED_AT = "2026-05-10T12:00:00.000Z";

const ids = {
  tenantOrg: fixtureId("or", 1),
  buyerOrg: fixtureId("or", 2),
  supplierOrg: fixtureId("or", 3),
  operator: fixtureId("op", 1),
  authUser: fixtureId("au", 1),
  authAccount: fixtureId("aa", 1),
  authOrganization: fixtureId("ao", 1),
  authMember: fixtureId("am", 1),
  buyerAuthUser: fixtureId("au", 2),
  buyerAuthAccount: fixtureId("aa", 2),
  buyerAuthOrganization: fixtureId("ao", 2),
  buyerAuthMember: fixtureId("am", 2),
  supplierAuthUser: fixtureId("au", 3),
  supplierAuthAccount: fixtureId("aa", 3),
  supplierAuthOrganization: fixtureId("ao", 3),
  supplierAuthMember: fixtureId("am", 3),
  buyerContact: fixtureId("co", 1),
  supplierContact: fixtureId("co", 2),
  buyerOpportunity: fixtureId("bo", 1),
  supplierOpportunity: fixtureId("so", 1),
  supplierContract: fixtureId("ct", 1),
  buyerContract: fixtureId("ct", 2),
  supplierAsset: fixtureId("sa", 1),
  datasetBrief: fixtureId("br", 1),
  licenseClause: fixtureId("lc", 1),
  consentRecord: fixtureId("cr", 1),
  dsarRequest: fixtureId("ds", 1),
  buildPlan: fixtureId("bp", 1),
  dataset: fixtureId("dt", 1),
  timeSeriesDataset: fixtureId("dt", 2),
  datasetVersion: fixtureId("dv", 1),
  previousDatasetVersion: fixtureId("dv", 2),
  timeSeriesDatasetVersion: fixtureId("dv", 3),
  bronzeDatasetPartition: fixtureId("dp", 1),
  silverDatasetPartition: fixtureId("dp", 2),
  goldDatasetPartition: fixtureId("dp", 3),
  sourceManifestArtifact: fixtureId("ma", 1),
  profileReportArtifact: fixtureId("ma", 2),
  qaReportArtifact: fixtureId("ma", 3),
  packageManifestArtifact: fixtureId("ma", 4),
  croissantManifestArtifact: fixtureId("ma", 5),
  lineageManifestArtifact: fixtureId("ma", 6),
  privacySummaryArtifact: fixtureId("ma", 7),
  modalityContract: fixtureId("mc", 1),
  timeSeriesModalityContract: fixtureId("mc", 2),
  enrichmentManifest: fixtureId("em", 1),
  activeLearningLoop: fixtureId("ll", 1),
  activeLearningCandidate: fixtureId("ac", 1),
  cleanlabQaPass: fixtureId("cq", 1),
  cleanlabLabelIssue: fixtureId("li", 1),
  piiMap: fixtureId("pm", 1),
  releaseDocumentationBundle: fixtureId("rd", 1),
  catalogueListing: fixtureId("cl", 1),
  privateOffer: fixtureId("po", 1),
  samplePreviewAccess: fixtureId("pa", 1),
  quote: fixtureId("qt", 1),
  delivery: fixtureId("dl", 1),
  subscription: fixtureId("su", 1),
  deltaManifest: fixtureId("dm", 1),
  invoice: fixtureId("iv", 1),
  payout: fixtureId("py", 1),
  costEntry: fixtureId("ce", 1),
  escalationCase: fixtureId("ec", 1),
  alert: fixtureId("al", 1),
  integration: fixtureId("in", 1),
  supplierPayoutIntegration: fixtureId("in", 2),
  signingKey: fixtureId("sk", 1),
  operatorElevation: fixtureId("oe", 1),
  accessControlScope: fixtureId("cc", 1),
  auditLoggingScope: fixtureId("cc", 2),
  dataProtectionScope: fixtureId("cc", 3),
  incidentResponseScope: fixtureId("cc", 4),
};

const fixtureBuilds = [
  {
    id: fixtureId("bd", 1),
    title: "Iberian retail receipts v3",
    state: "delivered",
    etaOffset: "7 days",
    qScore: 0.91,
    budgetCents: 250000,
    usedCents: 184000,
    gates: ["pass", "pass", "pass", "pass", "pass", "pass", "pass"],
  },
  {
    id: fixtureId("bd", 2),
    title: "Cold-chain route telemetry pilot",
    state: "privacy",
    etaOffset: "10 days",
    qScore: 0.84,
    budgetCents: 180000,
    usedCents: 96000,
    gates: ["pass", "pass", "pass", "review", "pending", "pending", "pending"],
  },
  {
    id: fixtureId("bd", 3),
    title: "Warranty document extraction eval set",
    state: "labeling",
    etaOffset: "12 days",
    qScore: 0.78,
    budgetCents: 320000,
    usedCents: 144000,
    gates: ["pass", "pass", "review", "pending", "pending", "review", "pending"],
  },
  {
    id: fixtureId("bd", 4),
    title: "Mediterranean crop imagery slice",
    state: "cleaning",
    etaOffset: "14 days",
    qScore: 0.73,
    budgetCents: 410000,
    usedCents: 112000,
    gates: ["pass", "review", "pending", "pending", "pending", "pending", "pending"],
  },
  {
    id: fixtureId("bd", 5),
    title: "Spanish support-ticket safety corpus",
    state: "packaging",
    etaOffset: "4 days",
    qScore: 0.94,
    budgetCents: 220000,
    usedCents: 196000,
    gates: ["pass", "pass", "pass", "pass", "pass", "review", "pass"],
  },
] as const;

const gateKeys = ["G-1", "G-2", "G-3", "G-4", "G-5", "G-6", "G-7"] as const;

function fixtureId(prefix: string, index: number) {
  return `${prefix}_01J2${String(index).padStart(22, "0")}`;
}

function getDatabaseUrl() {
  return getDatabaseUrlFromEnv({
    missingMessage:
      "DATABASE_URL or DATABASE_URL_FILE is required to seed Operator Console fixtures",
  });
}

async function query(client: PoolClient, sql: string, values: unknown[] = []) {
  await client.query(sql, values);
}

export async function seedOperatorConsoleFixtures() {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 1,
  });
  const client = await pool.connect();
  const passwordHash = await hashPassword(FIXTURE_OPERATOR_PASSWORD);

  try {
    await client.query("BEGIN");
    await client.query(
      `
        SELECT
          set_config('app.current_org_id', $1, true),
          set_config('app.current_operator_id', $2, true),
          set_config('app.is_service_role', 'true', true)
      `,
      [ids.tenantOrg, ids.operator]
    );

    await seedAuth(client, passwordHash);
    await seedOrganizationsAndOperator(client);
    await seedOpportunitiesAndRights(client);
    await seedBuilds(client);
    await seedDatasetAndCommercials(client);
    await seedEscalationCases(client);
    await seedOperatorElevation(client);
    await seedComplianceControlScopes(client);
    await seedAudit(client);

    await client.query("COMMIT");
    console.log(
      `Seeded Operator Console fixtures for ${FIXTURE_OPERATOR_EMAIL}`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function seedAuth(client: PoolClient, passwordHash: string) {
  await query(
    client,
    `
      INSERT INTO "auth_user" (
        "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "twoFactorEnabled"
      )
      VALUES ($1, 'Fixture Admin', $2, true, NULL, $3, $3, false)
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "email" = EXCLUDED."email",
        "emailVerified" = true,
        "updatedAt" = EXCLUDED."updatedAt",
        "twoFactorEnabled" = false
    `,
    [ids.authUser, FIXTURE_OPERATOR_EMAIL, FIXTURE_CREATED_AT]
  );

  await query(
    client,
    `
      INSERT INTO "auth_user" (
        "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "twoFactorEnabled"
      )
      VALUES ($1, 'Fixture Buyer', $2, true, NULL, $3, $3, false)
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "email" = EXCLUDED."email",
        "emailVerified" = true,
        "updatedAt" = EXCLUDED."updatedAt",
        "twoFactorEnabled" = false
    `,
    [ids.buyerAuthUser, FIXTURE_BUYER_EMAIL, FIXTURE_CREATED_AT]
  );

  await query(
    client,
    `
      INSERT INTO "auth_user" (
        "id", "name", "email", "emailVerified", "image", "createdAt", "updatedAt", "twoFactorEnabled"
      )
      VALUES ($1, 'Fixture Supplier', $2, true, NULL, $3, $3, false)
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "email" = EXCLUDED."email",
        "emailVerified" = true,
        "updatedAt" = EXCLUDED."updatedAt",
        "twoFactorEnabled" = false
    `,
    [ids.supplierAuthUser, FIXTURE_SUPPLIER_EMAIL, FIXTURE_CREATED_AT]
  );

  await query(
    client,
    `
      INSERT INTO "auth_account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, 'credential', $2, $3, $4, $4)
      ON CONFLICT ("id") DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "providerId" = 'credential',
        "userId" = EXCLUDED."userId",
        "password" = EXCLUDED."password",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    [ids.authAccount, ids.authUser, passwordHash, FIXTURE_CREATED_AT]
  );

  await query(
    client,
    `
      INSERT INTO "auth_account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, 'credential', $2, $3, $4, $4)
      ON CONFLICT ("id") DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "providerId" = 'credential',
        "userId" = EXCLUDED."userId",
        "password" = EXCLUDED."password",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    [
      ids.buyerAuthAccount,
      ids.buyerAuthUser,
      passwordHash,
      FIXTURE_CREATED_AT,
    ]
  );

  await query(
    client,
    `
      INSERT INTO "auth_account" (
        "id", "accountId", "providerId", "userId", "password", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, 'credential', $2, $3, $4, $4)
      ON CONFLICT ("id") DO UPDATE SET
        "accountId" = EXCLUDED."accountId",
        "providerId" = 'credential',
        "userId" = EXCLUDED."userId",
        "password" = EXCLUDED."password",
        "updatedAt" = EXCLUDED."updatedAt"
    `,
    [
      ids.supplierAuthAccount,
      ids.supplierAuthUser,
      passwordHash,
      FIXTURE_CREATED_AT,
    ]
  );

  await query(
    client,
    `
      INSERT INTO "auth_organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
      VALUES ($1, 'Caudals Fixture Org', 'caudals-fixture', NULL, $2, NULL)
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "slug" = EXCLUDED."slug",
        "metadata" = EXCLUDED."metadata"
    `,
    [ids.authOrganization, FIXTURE_CREATED_AT]
  );

  await query(
    client,
    `
      INSERT INTO "auth_organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
      VALUES (
        $1,
        'Iberian Retail Buyer Workspace',
        'iberian-retail-buyer',
        NULL,
        $2,
        $3
      )
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "slug" = EXCLUDED."slug",
        "metadata" = EXCLUDED."metadata"
    `,
    [
      ids.buyerAuthOrganization,
      FIXTURE_CREATED_AT,
      JSON.stringify({
        surface: "buyer",
        domainOrgId: ids.buyerOrg,
        tenantOrgId: ids.tenantOrg,
      }),
    ]
  );

  await query(
    client,
    `
      INSERT INTO "auth_organization" ("id", "name", "slug", "logo", "createdAt", "metadata")
      VALUES (
        $1,
        'Mediterranean Data Supplier Portal',
        'mediterranean-data-supplier',
        NULL,
        $2,
        $3
      )
      ON CONFLICT ("id") DO UPDATE SET
        "name" = EXCLUDED."name",
        "slug" = EXCLUDED."slug",
        "metadata" = EXCLUDED."metadata"
    `,
    [
      ids.supplierAuthOrganization,
      FIXTURE_CREATED_AT,
      JSON.stringify({
        surface: "supplier",
        domainOrgId: ids.supplierOrg,
        tenantOrgId: ids.tenantOrg,
      }),
    ]
  );

  await query(
    client,
    `
      INSERT INTO "auth_member" ("id", "organizationId", "userId", "role", "createdAt")
      VALUES ($1, $2, $3, 'admin', $4)
      ON CONFLICT ("id") DO UPDATE SET
        "organizationId" = EXCLUDED."organizationId",
        "userId" = EXCLUDED."userId",
        "role" = EXCLUDED."role"
    `,
    [ids.authMember, ids.authOrganization, ids.authUser, FIXTURE_CREATED_AT]
  );

  await query(
    client,
    `
      INSERT INTO "auth_member" ("id", "organizationId", "userId", "role", "createdAt")
      VALUES ($1, $2, $3, 'buyer_admin', $4)
      ON CONFLICT ("id") DO UPDATE SET
        "organizationId" = EXCLUDED."organizationId",
        "userId" = EXCLUDED."userId",
        "role" = EXCLUDED."role"
    `,
    [
      ids.buyerAuthMember,
      ids.buyerAuthOrganization,
      ids.buyerAuthUser,
      FIXTURE_CREATED_AT,
    ]
  );

  await query(
    client,
    `
      INSERT INTO "auth_member" ("id", "organizationId", "userId", "role", "createdAt")
      VALUES ($1, $2, $3, 'supplier_admin', $4)
      ON CONFLICT ("id") DO UPDATE SET
        "organizationId" = EXCLUDED."organizationId",
        "userId" = EXCLUDED."userId",
        "role" = EXCLUDED."role"
    `,
    [
      ids.supplierAuthMember,
      ids.supplierAuthOrganization,
      ids.supplierAuthUser,
      FIXTURE_CREATED_AT,
    ]
  );
}

async function seedOrganizationsAndOperator(client: PoolClient) {
  const organizations = [
    [ids.tenantOrg, "internal", "Caudals Operations SL", "Caudals Ops", "https://caudals.com", "ES"],
    [ids.buyerOrg, "buyer", "Iberian Retail AI Lab", "Iberian Retail", "https://buyer.example", "ES"],
    [ids.supplierOrg, "supplier", "Mediterranean Data Cooperative", "Med Data Coop", "https://supplier.example", "ES"],
  ];

  for (const org of organizations) {
    await query(
      client,
      `
        INSERT INTO organization (
          id, kind, legal_name, display_name, website, jurisdiction, state, created_at, updated_at, org_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          kind = EXCLUDED.kind,
          legal_name = EXCLUDED.legal_name,
          display_name = EXCLUDED.display_name,
          website = EXCLUDED.website,
          jurisdiction = EXCLUDED.jurisdiction,
          state = 'active',
          updated_at = EXCLUDED.updated_at,
          org_id = EXCLUDED.org_id,
          deleted_at = NULL
      `,
      [...org, FIXTURE_CREATED_AT, ids.tenantOrg]
    );
  }

  await query(
    client,
    `
      INSERT INTO "operator" (
        id, email, name, role, skill_profile, mfa_required, webauthn_required, state,
        created_at, updated_at, org_id
      )
      VALUES (
        $1, $2, 'Fixture Admin', 'admin',
        '{"focus":"operator-console-e2e"}'::jsonb,
        false, false, 'active', $3, $3, $4
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        skill_profile = EXCLUDED.skill_profile,
        mfa_required = EXCLUDED.mfa_required,
        webauthn_required = EXCLUDED.webauthn_required,
        state = 'active',
        updated_at = EXCLUDED.updated_at,
        org_id = EXCLUDED.org_id,
        deleted_at = NULL
    `,
    [ids.operator, FIXTURE_OPERATOR_EMAIL, FIXTURE_CREATED_AT, ids.tenantOrg]
  );
}

async function seedOpportunitiesAndRights(client: PoolClient) {
  await query(
    client,
    `
      INSERT INTO contact (id, org_id, full_name, email, role, signing_authority, created_at, updated_at, created_by)
      VALUES
        ($1, $3, 'Buyer Fixture', 'buyer.fixture@caudals.local', 'ML lead', true, $4, $4, $5),
        ($2, $3, 'Supplier Fixture', 'supplier.fixture@caudals.local', 'Data owner', true, $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        signing_authority = EXCLUDED.signing_authority,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.buyerContact,
      ids.supplierContact,
      ids.tenantOrg,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO buyer_opportunity (
        id, org_id, contact_id, title, use_case, modality, budget_range, timeline, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'Retail receipt extraction demand',
        'Train document models on multilingual receipts', 'document',
        '{"min":50000,"max":150000,"currency":"USD"}'::jsonb,
        'pilot in 30 days', 'pilot_active', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        use_case = EXCLUDED.use_case,
        modality = EXCLUDED.modality,
        budget_range = EXCLUDED.budget_range,
        timeline = EXCLUDED.timeline,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.buyerOpportunity, ids.tenantOrg, ids.buyerContact, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO supplier_opportunity (
        id, org_id, supplier_org_id, contact_id, title, asset_summary, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, 'Mediterranean supplier data room',
        'Receipts, route telemetry, crop imagery, and support-ticket exports',
        'full_active', $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        supplier_org_id = EXCLUDED.supplier_org_id,
        title = EXCLUDED.title,
        asset_summary = EXCLUDED.asset_summary,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.supplierOpportunity,
      ids.tenantOrg,
      ids.supplierOrg,
      ids.supplierContact,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO contract (
        id, org_id, counterparty_org_id, contract_type, document_uri, state, signed_at,
        starts_at, ends_at, created_at, updated_at, created_by
      )
      VALUES
        ($1, $3, $4, 'supplier', 's3://fixture/contracts/supplier.pdf', 'active', $6, $6, $6::timestamptz + interval '18 months', $6, $6, $7),
        ($2, $3, $5, 'buyer', 's3://fixture/contracts/buyer.pdf', 'signed', $6, $6, $6::timestamptz + interval '12 months', $6, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        counterparty_org_id = EXCLUDED.counterparty_org_id,
        contract_type = EXCLUDED.contract_type,
        document_uri = EXCLUDED.document_uri,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.supplierContract,
      ids.buyerContract,
      ids.tenantOrg,
      ids.supplierOrg,
      ids.buyerOrg,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO supplier_asset (
        id, org_id, supplier_org_id, contract_id, name, modality, declared_volume,
        refresh_policy, sensitivity, rights_summary, state, sample_upload_uri,
        sample_upload_filename, sample_upload_bytes, sample_upload_content_type,
        sample_upload_requested_at, sample_upload_received_at, created_at,
        updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, 'Iberian receipt and ticket corpus', 'document',
        '{"records":125000,"format":"pdf+json"}'::jsonb,
        'scheduled', 'pii',
        '{"aiTrainingRights":true,"ownershipConfirmed":true,"requiresRedaction":true}'::jsonb,
        'approved', 's3://fixture/supplier-samples/receipts-sample.zip',
        'receipts-sample.zip', 1048576, 'application/zip', $5, $5, $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        supplier_org_id = EXCLUDED.supplier_org_id,
        name = EXCLUDED.name,
        modality = EXCLUDED.modality,
        declared_volume = EXCLUDED.declared_volume,
        refresh_policy = EXCLUDED.refresh_policy,
        sensitivity = EXCLUDED.sensitivity,
        rights_summary = EXCLUDED.rights_summary,
        state = EXCLUDED.state,
        sample_upload_uri = EXCLUDED.sample_upload_uri,
        sample_upload_filename = EXCLUDED.sample_upload_filename,
        sample_upload_bytes = EXCLUDED.sample_upload_bytes,
        sample_upload_content_type = EXCLUDED.sample_upload_content_type,
        sample_upload_requested_at = EXCLUDED.sample_upload_requested_at,
        sample_upload_received_at = EXCLUDED.sample_upload_received_at,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.supplierAsset,
      ids.tenantOrg,
      ids.supplierOrg,
      ids.supplierContract,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO dataset_brief (
        id, org_id, buyer_opportunity_id, title, requirements, sensitivity_constraints,
        target_formats, state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'Multilingual receipt extraction eval set',
        '{"records":50000,"languages":["es","ca","pt"],"labels":["merchant","tax","total"]}'::jsonb,
        '{"pii":"redact","license":"commercial-ai"}'::jsonb,
        ARRAY['jsonl','parquet'], 'active', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        requirements = EXCLUDED.requirements,
        sensitivity_constraints = EXCLUDED.sensitivity_constraints,
        target_formats = EXCLUDED.target_formats,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.datasetBrief, ids.tenantOrg, ids.buyerOpportunity, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO license_clause (
        id, org_id, contract_id, asset_scope, permits_train, permits_finetune,
        permits_eval, permits_inference_commercial, permits_redistribute,
        exclusivity, geo, term_starts_at, term_ends_at, share_alike, notes,
        state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, '{"asset":"receipt-corpus"}'::jsonb,
        true, true, true, true, false, 'category', ARRAY['EU','US'],
        $4, $4::timestamptz + interval '18 months', false,
        'Fixture clause allows commercial training after PII redaction.',
        'active', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        asset_scope = EXCLUDED.asset_scope,
        permits_train = EXCLUDED.permits_train,
        permits_finetune = EXCLUDED.permits_finetune,
        permits_eval = EXCLUDED.permits_eval,
        permits_inference_commercial = EXCLUDED.permits_inference_commercial,
        permits_redistribute = EXCLUDED.permits_redistribute,
        exclusivity = EXCLUDED.exclusivity,
        geo = EXCLUDED.geo,
        term_ends_at = EXCLUDED.term_ends_at,
        share_alike = EXCLUDED.share_alike,
        notes = EXCLUDED.notes,
        state = 'active',
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.licenseClause, ids.tenantOrg, ids.supplierContract, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO consent_record (
        id, org_id, supplier_asset_id, subject_ref, lawful_basis, evidence_uri,
        state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'supplier-contract-article-6', 'contract',
        's3://fixture/evidence/consent.json', 'active', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        supplier_asset_id = EXCLUDED.supplier_asset_id,
        lawful_basis = EXCLUDED.lawful_basis,
        evidence_uri = EXCLUDED.evidence_uri,
        state = 'active',
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.consentRecord, ids.tenantOrg, ids.supplierAsset, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO dsar_request (
        id, org_id, subject_ref, request_type, state, sla_due_at,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, 'fixture-subject-001', 'access', 'identity_verified',
        $3::timestamptz + interval '10 days', $3, $3, $4
      )
      ON CONFLICT (id) DO UPDATE SET
        request_type = EXCLUDED.request_type,
        state = EXCLUDED.state,
        sla_due_at = EXCLUDED.sla_due_at,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.dsarRequest, ids.tenantOrg, FIXTURE_CREATED_AT, ids.operator]
  );
}

async function seedBuilds(client: PoolClient) {
  for (const [index, build] of fixtureBuilds.entries()) {
    await query(
      client,
      `
        INSERT INTO build (
          id, org_id, dataset_brief_id, supplier_opportunity_id, title, state,
          eta_at, q_score, cost_budget_cents, cost_used_cents,
          created_at, updated_at, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7::timestamptz + ($8::interval), $9, $10, $11,
          $7, $7, $12
        )
        ON CONFLICT (id) DO UPDATE SET
          dataset_brief_id = EXCLUDED.dataset_brief_id,
          supplier_opportunity_id = EXCLUDED.supplier_opportunity_id,
          title = EXCLUDED.title,
          state = EXCLUDED.state,
          eta_at = EXCLUDED.eta_at,
          q_score = EXCLUDED.q_score,
          cost_budget_cents = EXCLUDED.cost_budget_cents,
          cost_used_cents = EXCLUDED.cost_used_cents,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `,
      [
        build.id,
        ids.tenantOrg,
        ids.datasetBrief,
        ids.supplierOpportunity,
        build.title,
        build.state,
        FIXTURE_CREATED_AT,
        build.etaOffset,
        build.qScore,
        build.budgetCents,
        build.usedCents,
        ids.operator,
      ]
    );

    for (const [gateIndex, gate] of build.gates.entries()) {
      await query(
        client,
        `
          INSERT INTO gate_event (id, org_id, build_id, gate_key, verdict, evidence, created_at, created_by)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz + ($8::int * interval '1 hour'), $9)
          ON CONFLICT (id) DO UPDATE SET
            build_id = EXCLUDED.build_id,
            gate_key = EXCLUDED.gate_key,
            verdict = EXCLUDED.verdict,
            evidence = EXCLUDED.evidence,
            created_by = EXCLUDED.created_by
        `,
        [
          fixtureId("ge", index * gateKeys.length + gateIndex + 1),
          ids.tenantOrg,
          build.id,
          gateKeys[gateIndex],
          gate,
          JSON.stringify({ fixture: true, gate: gateKeys[gateIndex] }),
          FIXTURE_CREATED_AT,
          index * gateKeys.length + gateIndex,
          ids.operator,
        ]
      );
    }

    await query(
      client,
      `
        INSERT INTO run (
          id, org_id, build_id, build_plan_id, external_run_id, state,
          retry_count, started_at, finished_at, created_at, updated_at, created_by
        )
        VALUES (
          $1, $2, $3, NULL, $4, $5, 0,
          $6, NULL, $6, $6, $7
        )
        ON CONFLICT (id) DO UPDATE SET
          build_id = EXCLUDED.build_id,
          external_run_id = EXCLUDED.external_run_id,
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `,
      [
        fixtureId("rn", index + 1),
        ids.tenantOrg,
        build.id,
        `fixture-run-${index + 1}`,
        index === 3 ? "queued" : "running",
        FIXTURE_CREATED_AT,
        ids.operator,
      ]
    );
  }

  await query(
    client,
    `
      INSERT INTO build_plan (
        id, org_id, build_id, manifest_yaml, composed_permits, license_blocked,
        state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'version: fixture\nsteps:\n  - profile\n  - redact\n  - qa\n',
        '{"train":true,"commercialInference":true}'::jsonb,
        false, 'approved', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        build_id = EXCLUDED.build_id,
        manifest_yaml = EXCLUDED.manifest_yaml,
        composed_permits = EXCLUDED.composed_permits,
        license_blocked = false,
        state = 'approved',
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.buildPlan, ids.tenantOrg, fixtureBuilds[0].id, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO label_batch (
        id, org_id, build_id, state, queue_depth, agreement_score,
        created_at, updated_at, created_by
      )
      VALUES ($1, $2, $3, 'in_review', 420, 0.872, $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        build_id = EXCLUDED.build_id,
        state = EXCLUDED.state,
        queue_depth = EXCLUDED.queue_depth,
        agreement_score = EXCLUDED.agreement_score,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [fixtureId("lb", 1), ids.tenantOrg, fixtureBuilds[2].id, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO active_learning_loop (
        id, org_id, build_id, label_batch_id, strategy, state,
        candidate_source_uri, embedding_index_uri, model_snapshot_uri,
        uncertainty_metric, diversity_metric, boundary_metric,
        target_sample_size, selected_count, selection_manifest_uri,
        selection_summary, reviewer_routing, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, 'hybrid_uncertainty_diversity', 'review',
        's3://fixture/silver/crop-candidates.jsonl',
        's3://fixture/indexes/crop-lightly-v1.lance',
        's3://fixture/models/crop-assistant-v2',
        'entropy', 'embedding_distance', 'margin',
        128, 96,
        's3://fixture/manifests/active-learning-crop-loop.json',
        '{"summary":"High-uncertainty and diverse boundary samples selected."}'::jsonb,
        '{"policy":"cv_specialists:priority_high"}'::jsonb,
        $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        build_id = EXCLUDED.build_id,
        label_batch_id = EXCLUDED.label_batch_id,
        strategy = EXCLUDED.strategy,
        state = EXCLUDED.state,
        candidate_source_uri = EXCLUDED.candidate_source_uri,
        embedding_index_uri = EXCLUDED.embedding_index_uri,
        model_snapshot_uri = EXCLUDED.model_snapshot_uri,
        uncertainty_metric = EXCLUDED.uncertainty_metric,
        diversity_metric = EXCLUDED.diversity_metric,
        boundary_metric = EXCLUDED.boundary_metric,
        target_sample_size = EXCLUDED.target_sample_size,
        selected_count = EXCLUDED.selected_count,
        selection_manifest_uri = EXCLUDED.selection_manifest_uri,
        selection_summary = EXCLUDED.selection_summary,
        reviewer_routing = EXCLUDED.reviewer_routing,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.activeLearningLoop,
      ids.tenantOrg,
      fixtureBuilds[3].id,
      fixtureId("lb", 1),
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO active_learning_candidate (
        id, org_id, active_learning_loop_id, item_ref,
        uncertainty_score, diversity_score, boundary_score, combined_score,
        selection_reason, route_state, reviewer_priority, metadata,
        created_at, created_by
      )
      VALUES (
        $1, $2, $3, 'silver/crop/frame-0042',
        0.9200, 0.8100, 0.6400, 0.8255,
        'uncertainty=0.920; diversity=0.810; boundary=0.640',
        'selected', 1, '{"fixture":true}'::jsonb, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        active_learning_loop_id = EXCLUDED.active_learning_loop_id,
        item_ref = EXCLUDED.item_ref,
        uncertainty_score = EXCLUDED.uncertainty_score,
        diversity_score = EXCLUDED.diversity_score,
        boundary_score = EXCLUDED.boundary_score,
        combined_score = EXCLUDED.combined_score,
        selection_reason = EXCLUDED.selection_reason,
        route_state = EXCLUDED.route_state,
        reviewer_priority = EXCLUDED.reviewer_priority,
        metadata = EXCLUDED.metadata
    `,
    [
      ids.activeLearningCandidate,
      ids.tenantOrg,
      ids.activeLearningLoop,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO qa_report (
        id, org_id, build_id, dimensions, composite_score, verdict,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3,
        '{"completeness":0.99,"accuracy":0.86,"privacy":1.0}'::jsonb,
        0.91, 'review', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        build_id = EXCLUDED.build_id,
        dimensions = EXCLUDED.dimensions,
        composite_score = EXCLUDED.composite_score,
        verdict = EXCLUDED.verdict,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [fixtureId("qr", 1), ids.tenantOrg, fixtureBuilds[0].id, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO cleanlab_qa_pass (
        id, org_id, qa_report_id, label_batch_id, build_id, scan_strategy,
        state, input_manifest_uri, cleanlab_report_uri, model_snapshot_uri,
        scanned_count, suspected_label_errors, estimated_error_rate,
        error_rate_threshold, requeue_count, requeue_manifest_uri, summary,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, 'confident_learning',
        'review',
        's3://fixture/labels/receipt-pass-1.jsonl',
        's3://fixture/qa/cleanlab-receipt-report.json',
        's3://fixture/models/receipt-label-error-detector',
        128, 3, 0.02344, 0.03000, 3,
        's3://fixture/qa/cleanlab-requeue-receipts.jsonl',
        '{"summary":"Confident-learning scan routed three likely receipt OCR label errors to reviewers."}'::jsonb,
        $6, $6, $7
      )
      ON CONFLICT (id) DO UPDATE SET
        qa_report_id = EXCLUDED.qa_report_id,
        label_batch_id = EXCLUDED.label_batch_id,
        build_id = EXCLUDED.build_id,
        scan_strategy = EXCLUDED.scan_strategy,
        state = EXCLUDED.state,
        input_manifest_uri = EXCLUDED.input_manifest_uri,
        cleanlab_report_uri = EXCLUDED.cleanlab_report_uri,
        model_snapshot_uri = EXCLUDED.model_snapshot_uri,
        scanned_count = EXCLUDED.scanned_count,
        suspected_label_errors = EXCLUDED.suspected_label_errors,
        estimated_error_rate = EXCLUDED.estimated_error_rate,
        error_rate_threshold = EXCLUDED.error_rate_threshold,
        requeue_count = EXCLUDED.requeue_count,
        requeue_manifest_uri = EXCLUDED.requeue_manifest_uri,
        summary = EXCLUDED.summary,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.cleanlabQaPass,
      ids.tenantOrg,
      fixtureId("qr", 1),
      fixtureId("lb", 1),
      fixtureBuilds[0].id,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO cleanlab_label_issue (
        id, org_id, cleanlab_qa_pass_id, item_ref, observed_label,
        suggested_label, issue_score, confidence, issue_reason, route_state,
        reviewer_priority, metadata, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'silver/receipts/doc-0042', 'merchant_total',
        'tax_total', 0.9400, 0.8100,
        'Self-confidence below class prior and nearest-neighbor labels disagree.',
        'requeued', 1, '{"fixture":true}'::jsonb, $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        cleanlab_qa_pass_id = EXCLUDED.cleanlab_qa_pass_id,
        item_ref = EXCLUDED.item_ref,
        observed_label = EXCLUDED.observed_label,
        suggested_label = EXCLUDED.suggested_label,
        issue_score = EXCLUDED.issue_score,
        confidence = EXCLUDED.confidence,
        issue_reason = EXCLUDED.issue_reason,
        route_state = EXCLUDED.route_state,
        reviewer_priority = EXCLUDED.reviewer_priority,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.cleanlabLabelIssue,
      ids.tenantOrg,
      ids.cleanlabQaPass,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );
}

async function seedRepresentativeDatasetPartitions(client: PoolClient) {
  const partitions = [
    {
      id: ids.bronzeDatasetPartition,
      layer: "bronze",
      partitionKey: "source_date=2026-05-10/source=supplier_receipts",
      objectUri:
        "s3://fixture/lakehouse/bronze/receipts/source_date=2026-05-10/raw.parquet",
      contentHash: "sha256:fixture-bronze-receipts-v1",
      format: "parquet",
      recordCount: 50240,
      sizeBytes: 2097152,
      state: "sealed",
      provenance: {
        buildId: fixtureBuilds[0].id,
        sourceAssetId: ids.supplierAsset,
        gate: "G-1",
        intakeManifestUri: "s3://fixture/manifests/receipt-v1/source-manifest.json",
        rightsVerified: true,
      },
    },
    {
      id: ids.silverDatasetPartition,
      layer: "silver",
      partitionKey: "source_date=2026-05-10/redaction=v1",
      objectUri:
        "s3://fixture/lakehouse/silver/receipts/source_date=2026-05-10/redacted.parquet",
      contentHash: "sha256:fixture-silver-receipts-v1",
      format: "parquet",
      recordCount: 50000,
      sizeBytes: 1572864,
      state: "promoted",
      provenance: {
        buildId: fixtureBuilds[0].id,
        upstreamPartitionId: ids.bronzeDatasetPartition,
        gates: ["G-2", "G-3", "G-4"],
        piiMapId: ids.piiMap,
        lineageRunId: "fixture-run-1",
      },
    },
    {
      id: ids.goldDatasetPartition,
      layer: "gold",
      partitionKey: "version=v1.0-fixture/package=buyer_delivery",
      objectUri:
        "s3://fixture/lakehouse/gold/receipts/version=v1.0-fixture/package.parquet",
      contentHash: "sha256:fixture-gold-receipts-v1",
      format: "parquet",
      recordCount: 50000,
      sizeBytes: 1048576,
      state: "promoted",
      provenance: {
        buildId: fixtureBuilds[0].id,
        upstreamPartitionId: ids.silverDatasetPartition,
        gates: ["G-5", "G-6", "G-7"],
        qaReportId: fixtureId("qr", 1),
        releaseDocumentationBundleId: ids.releaseDocumentationBundle,
      },
    },
  ] as const;

  for (const partition of partitions) {
    await query(
      client,
      `
        INSERT INTO dataset_partition (
          id, org_id, dataset_version_id, layer, partition_key, object_uri,
          content_hash, format, record_count, size_bytes, provenance_manifest,
          state, created_at, updated_at, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11::jsonb, $12, $13, $13, $14
        )
        ON CONFLICT (id) DO UPDATE SET
          dataset_version_id = EXCLUDED.dataset_version_id,
          layer = EXCLUDED.layer,
          partition_key = EXCLUDED.partition_key,
          object_uri = EXCLUDED.object_uri,
          content_hash = EXCLUDED.content_hash,
          format = EXCLUDED.format,
          record_count = EXCLUDED.record_count,
          size_bytes = EXCLUDED.size_bytes,
          provenance_manifest = EXCLUDED.provenance_manifest,
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `,
      [
        partition.id,
        ids.tenantOrg,
        ids.datasetVersion,
        partition.layer,
        partition.partitionKey,
        partition.objectUri,
        partition.contentHash,
        partition.format,
        partition.recordCount,
        partition.sizeBytes,
        JSON.stringify(partition.provenance),
        partition.state,
        FIXTURE_CREATED_AT,
        ids.operator,
      ]
    );
  }
}

async function seedRepresentativeManifestArtifacts(client: PoolClient) {
  const artifacts = [
    {
      id: ids.sourceManifestArtifact,
      artifactType: "source_manifest",
      artifactUri: "s3://fixture/manifests/receipt-v1/source-manifest.json",
      contentHash: "sha256:fixture-source-manifest-v1",
      state: "approved",
      metadata: {
        gate: "G-1",
        supplierAssetId: ids.supplierAsset,
        partitionIds: [ids.bronzeDatasetPartition],
      },
    },
    {
      id: ids.profileReportArtifact,
      artifactType: "profile_report",
      artifactUri: "s3://fixture/reports/receipt-v1/profile-report.json",
      contentHash: "sha256:fixture-profile-report-v1",
      state: "approved",
      metadata: {
        gate: "G-2",
        completeness: 0.99,
        schemaDrift: "none",
      },
    },
    {
      id: ids.qaReportArtifact,
      artifactType: "qa_report",
      artifactUri: "s3://fixture/qa/receipt-v1/qa-scorecard.json",
      contentHash: "sha256:fixture-qa-report-v1",
      state: "approved",
      metadata: {
        gate: "G-6",
        qaReportId: fixtureId("qr", 1),
        compositeScore: 0.91,
        verdict: "reviewed_pass",
      },
    },
    {
      id: ids.packageManifestArtifact,
      artifactType: "package_manifest",
      artifactUri: "s3://fixture/manifests/receipt-v1/package-manifest.json",
      contentHash: "sha256:fixture-package-manifest-v1",
      state: "published",
      metadata: {
        gate: "G-7",
        deliveryId: ids.delivery,
        releaseDocumentationBundleId: ids.releaseDocumentationBundle,
        partitionIds: [ids.goldDatasetPartition],
      },
    },
    {
      id: ids.croissantManifestArtifact,
      artifactType: "croissant",
      artifactUri: "s3://fixture/manifests/receipt-v1/croissant.jsonld",
      contentHash: "sha256:fixture-croissant-v1",
      state: "published",
      metadata: {
        releaseDocumentationBundleId: ids.releaseDocumentationBundle,
        conformsTo: "https://mlcommons.org/croissant/1.0",
      },
    },
    {
      id: ids.lineageManifestArtifact,
      artifactType: "lineage_manifest",
      artifactUri: "s3://fixture/lineage/receipt-v1/openlineage.json",
      contentHash: "sha256:fixture-lineage-manifest-v1",
      state: "published",
      metadata: {
        namespace: "caudals.fixture",
        runId: "fixture-run-1",
        lineageEventId: fixtureId("le", 1),
      },
    },
    {
      id: ids.privacySummaryArtifact,
      artifactType: "privacy_summary",
      artifactUri: "s3://fixture/privacy/receipt-v1/privacy-summary.json",
      contentHash: "sha256:fixture-privacy-summary-v1",
      state: "approved",
      metadata: {
        gate: "G-4",
        piiMapId: ids.piiMap,
        residualRisk: "accepted_by_operator_policy",
      },
    },
  ] as const;

  for (const artifact of artifacts) {
    await query(
      client,
      `
        INSERT INTO manifest_artifact (
          id, org_id, dataset_version_id, build_id, artifact_type,
          artifact_uri, content_hash, metadata, state, created_at, updated_at, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $10, $11
        )
        ON CONFLICT (id) DO UPDATE SET
          dataset_version_id = EXCLUDED.dataset_version_id,
          build_id = EXCLUDED.build_id,
          artifact_type = EXCLUDED.artifact_type,
          artifact_uri = EXCLUDED.artifact_uri,
          content_hash = EXCLUDED.content_hash,
          metadata = EXCLUDED.metadata,
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `,
      [
        artifact.id,
        ids.tenantOrg,
        ids.datasetVersion,
        fixtureBuilds[0].id,
        artifact.artifactType,
        artifact.artifactUri,
        artifact.contentHash,
        JSON.stringify(artifact.metadata),
        artifact.state,
        FIXTURE_CREATED_AT,
        ids.operator,
      ]
    );
  }
}

async function seedDatasetAndCommercials(client: PoolClient) {
  await query(
    client,
    `
      INSERT INTO dataset (id, org_id, name, modality, state, created_at, updated_at, created_by)
      VALUES ($1, $2, 'Iberian retail receipt extraction corpus', 'document', 'active', $3, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        modality = EXCLUDED.modality,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.dataset, ids.tenantOrg, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO dataset (id, org_id, name, modality, state, created_at, updated_at, created_by)
      VALUES ($1, $2, 'Cold-chain route telemetry corpus', 'timeseries', 'active', $3, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        modality = EXCLUDED.modality,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.timeSeriesDataset, ids.tenantOrg, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO dataset_version (
        id, org_id, dataset_id, version_label, build_id, manifest_uri, content_hash,
        size_bytes, record_count, composed_permits, qa_score, state, released_at,
        released_by, signed_by, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'v0.9-fixture', $4, 's3://fixture/manifests/receipt-v0.yaml',
        'fixture-previous-content-hash', 917504, 48698,
        '{"train":true,"commercialInference":true}'::jsonb,
        0.90, 'released', $5, $6, $7, $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_id = EXCLUDED.dataset_id,
        build_id = EXCLUDED.build_id,
        manifest_uri = EXCLUDED.manifest_uri,
        content_hash = EXCLUDED.content_hash,
        record_count = EXCLUDED.record_count,
        composed_permits = EXCLUDED.composed_permits,
        qa_score = EXCLUDED.qa_score,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.previousDatasetVersion,
      ids.tenantOrg,
      ids.dataset,
      fixtureBuilds[0].id,
      FIXTURE_CREATED_AT,
      ids.operator,
      ids.signingKey,
    ]
  );

  await query(
    client,
    `
      INSERT INTO dataset_version (
        id, org_id, dataset_id, version_label, build_id, manifest_uri, content_hash,
        size_bytes, record_count, composed_permits, qa_score, state, released_at,
        released_by, signed_by, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'v1.0-fixture', $4, 's3://fixture/manifests/receipt-v1.yaml',
        'fixture-content-hash', 1048576, 50000,
        '{"train":true,"commercialInference":true}'::jsonb,
        0.91, 'released', $5, $6, $7, $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_id = EXCLUDED.dataset_id,
        build_id = EXCLUDED.build_id,
        manifest_uri = EXCLUDED.manifest_uri,
        content_hash = EXCLUDED.content_hash,
        record_count = EXCLUDED.record_count,
        composed_permits = EXCLUDED.composed_permits,
        qa_score = EXCLUDED.qa_score,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.datasetVersion,
      ids.tenantOrg,
      ids.dataset,
      fixtureBuilds[0].id,
      FIXTURE_CREATED_AT,
      ids.operator,
      ids.signingKey,
    ]
  );

  await query(
    client,
    `
      INSERT INTO dataset_version (
        id, org_id, dataset_id, version_label, build_id, manifest_uri, content_hash,
        size_bytes, record_count, composed_permits, qa_score, state, released_at,
        released_by, signed_by, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'v0.3-fixture', $4, 's3://fixture/manifests/cold-chain-telemetry-v0.yaml',
        'fixture-timeseries-content-hash', 7340032, 1250000,
        '{"train":true,"eval":true,"commercialInference":false}'::jsonb,
        0.84, 'released', $5, $6, $7, $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_id = EXCLUDED.dataset_id,
        build_id = EXCLUDED.build_id,
        manifest_uri = EXCLUDED.manifest_uri,
        content_hash = EXCLUDED.content_hash,
        record_count = EXCLUDED.record_count,
        composed_permits = EXCLUDED.composed_permits,
        qa_score = EXCLUDED.qa_score,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.timeSeriesDatasetVersion,
      ids.tenantOrg,
      ids.timeSeriesDataset,
      fixtureBuilds[1].id,
      FIXTURE_CREATED_AT,
      ids.operator,
      ids.signingKey,
    ]
  );

  await seedRepresentativeDatasetPartitions(client);

  await query(
    client,
    `
      INSERT INTO lineage_event (
        id, org_id, dataset_version_id, namespace, job_name, run_id,
        event_time, payload, created_at, created_by
      )
      VALUES (
        $1, $2, $3, 'caudals.fixture', 'receipt_redaction_quality_gate',
        'fixture-run-1', $4, '{"eventType":"COMPLETE","producer":"fixture"}'::jsonb,
        $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        namespace = EXCLUDED.namespace,
        job_name = EXCLUDED.job_name,
        run_id = EXCLUDED.run_id,
        event_time = EXCLUDED.event_time,
        payload = EXCLUDED.payload
    `,
    [fixtureId("le", 1), ids.tenantOrg, ids.datasetVersion, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO modality_contract (
        id, org_id, dataset_version_id, modality, canonical_format,
        profile_signals, cleaning_operators, privacy_treatments,
        labeling_widgets, qa_dimensions, packaging_targets,
        state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'document', 'Parquet page records plus original PDF references',
        '["page_count","layout_type_inventory","language_mix","ocr_confidence","tabular_data_ratio"]'::jsonb,
        '["ocr_normalize","page_dedup","layout_segment","table_extract"]'::jsonb,
        '["signature_redaction","printed_pii_redaction","handwriting_review","source_pdf_access_control"]'::jsonb,
        ARRAY['page_region','field_extraction','table_cell','signature_presence'],
        '["layout_fidelity","ocr_confidence","field_accuracy","redaction_residual"]'::jsonb,
        ARRAY['page_parquet','jsonl_fields','pdf_bundle','rest_query'],
        'review', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        modality = EXCLUDED.modality,
        canonical_format = EXCLUDED.canonical_format,
        profile_signals = EXCLUDED.profile_signals,
        cleaning_operators = EXCLUDED.cleaning_operators,
        privacy_treatments = EXCLUDED.privacy_treatments,
        labeling_widgets = EXCLUDED.labeling_widgets,
        qa_dimensions = EXCLUDED.qa_dimensions,
        packaging_targets = EXCLUDED.packaging_targets,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.modalityContract, ids.tenantOrg, ids.datasetVersion, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO modality_contract (
        id, org_id, dataset_version_id, modality, canonical_format,
        profile_signals, cleaning_operators, privacy_treatments,
        labeling_widgets, qa_dimensions, packaging_targets,
        state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'timeseries', 'Iceberg Parquet partitioned by event time and entity',
        '["sample_rate","gap_distribution","regime_changes","seasonality_fingerprint","sensor_drift"]'::jsonb,
        '["sample_rate_align","gap_policy_apply","clock_skew_correct","outlier_window_flag"]'::jsonb,
        '["entity_pseudonymize","location_precision_reduce","blackout_window_apply"]'::jsonb,
        ARRAY['event_window','anomaly_span','regime_marker','calibration_jump'],
        '["temporal_continuity","gap_policy_compliance","split_leakage","sensor_drift"]'::jsonb,
        ARRAY['time_partitioned_parquet','arrow_ipc','rest_cursor'],
        'review', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        modality = EXCLUDED.modality,
        canonical_format = EXCLUDED.canonical_format,
        profile_signals = EXCLUDED.profile_signals,
        cleaning_operators = EXCLUDED.cleaning_operators,
        privacy_treatments = EXCLUDED.privacy_treatments,
        labeling_widgets = EXCLUDED.labeling_widgets,
        qa_dimensions = EXCLUDED.qa_dimensions,
        packaging_targets = EXCLUDED.packaging_targets,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.timeSeriesModalityContract,
      ids.tenantOrg,
      ids.timeSeriesDatasetVersion,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO enrichment_manifest (
        id, org_id, build_id, dataset_version_id, modality_contract_id,
        enrichment_class, added_columns, sources, source_license,
        source_version, computation_method, reproducer_uri, spot_check_rate,
        independence_passed, license_compatible, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, 'derived_features',
        '["merchant_name","receipt_total","line_item_count"]'::jsonb,
        '["Caudals receipt OCR silver pages","Supplier field dictionary"]'::jsonb,
        'supplier-contract', '2026.05',
        'Layout-aware receipt field extraction from silver page records with operator spot checks.',
        's3://fixture/manifests/enrichment-receipt-fields.json',
        0.100, true, true, 'review', $6, $6, $7
      )
      ON CONFLICT (id) DO UPDATE SET
        build_id = EXCLUDED.build_id,
        dataset_version_id = EXCLUDED.dataset_version_id,
        modality_contract_id = EXCLUDED.modality_contract_id,
        enrichment_class = EXCLUDED.enrichment_class,
        added_columns = EXCLUDED.added_columns,
        sources = EXCLUDED.sources,
        source_license = EXCLUDED.source_license,
        source_version = EXCLUDED.source_version,
        computation_method = EXCLUDED.computation_method,
        reproducer_uri = EXCLUDED.reproducer_uri,
        spot_check_rate = EXCLUDED.spot_check_rate,
        independence_passed = EXCLUDED.independence_passed,
        license_compatible = EXCLUDED.license_compatible,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.enrichmentManifest,
      ids.tenantOrg,
      fixtureBuilds[0].id,
      ids.datasetVersion,
      ids.modalityContract,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO pii_map (
        id, org_id, dataset_version_id, findings, treatments, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3,
        '{"email":124,"phone":48}'::jsonb,
        '{"email":"tokenized","phone":"removed"}'::jsonb,
        'approved', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        findings = EXCLUDED.findings,
        treatments = EXCLUDED.treatments,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.piiMap, ids.tenantOrg, ids.datasetVersion, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO catalogue_listing (
        id, org_id, dataset_id, dataset_version_id, title, pricing,
        visibility, sample_preview_uri, sample_preview_policy,
        refresh_cadence, license_tier, state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, 'Operator-managed receipt corpus listing',
        '{"priceCents":990000,"currency":"USD","billingModel":"pilot"}'::jsonb,
        'public',
        's3://fixture/previews/receipt-sample.jsonl',
        '{"gate":"nda_required","watermark":true}'::jsonb,
        'monthly',
        'evaluation',
        'active', $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        title = EXCLUDED.title,
        pricing = EXCLUDED.pricing,
        visibility = EXCLUDED.visibility,
        sample_preview_uri = EXCLUDED.sample_preview_uri,
        sample_preview_policy = EXCLUDED.sample_preview_policy,
        refresh_cadence = EXCLUDED.refresh_cadence,
        license_tier = EXCLUDED.license_tier,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.catalogueListing,
      ids.tenantOrg,
      ids.dataset,
      ids.datasetVersion,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  const releaseDocumentationBundle = buildReleaseDocumentationBundle({
    dataset: {
      id: ids.dataset,
      name: "Iberian retail receipt extraction corpus",
      modality: "document",
    },
    version: {
      id: ids.datasetVersion,
      label: "v1.0-fixture",
      manifestUri: "s3://fixture/manifests/receipt-v1.yaml",
      contentHash: "fixture-content-hash",
      sizeBytes: 1048576,
      recordCount: 50000,
      qaScore: 0.91,
      releasedAt: FIXTURE_CREATED_AT,
    },
    build: {
      id: fixtureBuilds[0].id,
      title: fixtureBuilds[0].title,
      state: fixtureBuilds[0].state,
    },
    catalogue: {
      id: ids.catalogueListing,
      title: "Operator-managed receipt corpus listing",
      visibility: "public",
      licenseTier: "evaluation",
      refreshCadence: "monthly",
      samplePreviewUri: "s3://fixture/previews/receipt-sample.jsonl",
    },
    license: {
      spdxId: "supplier-contract",
      permits: {
        train: true,
        finetune: true,
        eval: true,
        commercialInference: true,
      },
      geo: ["WW"],
    },
    quality: {
      score: 0.91,
      verdict: "pass",
      dimensions: {
        layout_fidelity: 0.93,
        ocr_confidence: 0.91,
      },
    },
    privacy: {
      state: "approved",
      findings: {
        email: 124,
        phone: 48,
      },
      treatments: {
        email: "tokenized",
        phone: "removed",
      },
    },
    lineage: [
      {
        namespace: "caudals.fixture",
        jobName: "receipt_redaction_quality_gate",
        runId: "fixture-run-1",
        eventTime: FIXTURE_CREATED_AT,
      },
    ],
    modalityContract: {
      canonicalFormat: "Parquet page records plus original PDF references",
      packagingTargets: ["page_parquet", "jsonl_fields", "pdf_bundle", "rest_query"],
      qaDimensions: [
        "layout_fidelity",
        "ocr_confidence",
        "field_accuracy",
        "redaction_residual",
      ],
      privacyTreatments: [
        "signature_redaction",
        "printed_pii_redaction",
        "handwriting_review",
        "source_pdf_access_control",
      ],
    },
    signingKeyId: ids.signingKey,
    documentationUri: "s3://fixture/docs/receipt-v1/release-documentation.json",
    hfMirror: {
      namespace: "caudals",
      repoId: "iberian-retail-receipt-corpus",
      url: "https://huggingface.co/datasets/caudals/iberian-retail-receipt-corpus",
      status: "planned",
      license: "supplier-contract",
    },
  });

  await query(
    client,
    `
      INSERT INTO release_documentation_bundle (
        id, org_id, dataset_version_id, catalogue_listing_id,
        documentation_uri, package_manifest, croissant_manifest,
        article10_document, required_documents, hf_mirror,
        validation_summary, state, generated_at, published_at,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb,
        $9::jsonb, $10::jsonb, $11::jsonb, 'published',
        $12, $12, $12, $12, $13
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        catalogue_listing_id = EXCLUDED.catalogue_listing_id,
        documentation_uri = EXCLUDED.documentation_uri,
        package_manifest = EXCLUDED.package_manifest,
        croissant_manifest = EXCLUDED.croissant_manifest,
        article10_document = EXCLUDED.article10_document,
        required_documents = EXCLUDED.required_documents,
        hf_mirror = EXCLUDED.hf_mirror,
        validation_summary = EXCLUDED.validation_summary,
        state = EXCLUDED.state,
        generated_at = EXCLUDED.generated_at,
        published_at = EXCLUDED.published_at,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.releaseDocumentationBundle,
      ids.tenantOrg,
      ids.datasetVersion,
      ids.catalogueListing,
      releaseDocumentationBundle.documentationUri,
      JSON.stringify(releaseDocumentationBundle.packageManifest),
      JSON.stringify(releaseDocumentationBundle.croissantManifest),
      JSON.stringify(releaseDocumentationBundle.article10Document),
      JSON.stringify(releaseDocumentationBundle.requiredDocuments),
      JSON.stringify(releaseDocumentationBundle.hfMirror),
      JSON.stringify(releaseDocumentationBundle.validationSummary),
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await seedRepresentativeManifestArtifacts(client);

  await query(
    client,
    `
      INSERT INTO private_offer (
        id, org_id, buyer_org_id, dataset_id, dataset_version_id,
        terms, sample_preview_uri, sample_preview_policy,
        state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5,
        '{"term":"12 months","scope":"evaluation+fine-tuning"}'::jsonb,
        's3://fixture/previews/private-offer-sample.jsonl',
        '{"gate":"operator_approved","watermark":true}'::jsonb,
        'sent', $6, $6, $7
      )
      ON CONFLICT (id) DO UPDATE SET
        buyer_org_id = EXCLUDED.buyer_org_id,
        dataset_id = EXCLUDED.dataset_id,
        dataset_version_id = EXCLUDED.dataset_version_id,
        terms = EXCLUDED.terms,
        sample_preview_uri = EXCLUDED.sample_preview_uri,
        sample_preview_policy = EXCLUDED.sample_preview_policy,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.privateOffer,
      ids.tenantOrg,
      ids.buyerOrg,
      ids.dataset,
      ids.datasetVersion,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO sample_preview_access (
        id, org_id, catalogue_listing_id, buyer_org_id, state,
        nda_acknowledged_at, watermark_subject, decision_reason,
        expires_at, decided_by, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, 'nda_acknowledged',
        $5, 'buyer_org', 'Fixture buyer acknowledged NDA for preview review.',
        $5::timestamptz + interval '14 days', NULL, $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        catalogue_listing_id = EXCLUDED.catalogue_listing_id,
        buyer_org_id = EXCLUDED.buyer_org_id,
        state = EXCLUDED.state,
        nda_acknowledged_at = EXCLUDED.nda_acknowledged_at,
        watermark_subject = EXCLUDED.watermark_subject,
        decision_reason = EXCLUDED.decision_reason,
        expires_at = EXCLUDED.expires_at,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.samplePreviewAccess,
      ids.tenantOrg,
      ids.catalogueListing,
      ids.buyerOrg,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO quote (
        id, org_id, buyer_org_id, buyer_opportunity_id, amount_cents, currency, state,
        created_at, updated_at, created_by
      )
      VALUES ($1, $2, $3, $4, 990000, 'USD', 'sent', $5, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        buyer_org_id = EXCLUDED.buyer_org_id,
        buyer_opportunity_id = EXCLUDED.buyer_opportunity_id,
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.quote,
      ids.tenantOrg,
      ids.buyerOrg,
      ids.buyerOpportunity,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO subscription (
        id, org_id, buyer_org_id, dataset_id, contract_id, private_offer_id,
        current_dataset_version_id, cadence, delivery_channel, state,
        rolling_window_versions, next_refresh_at, retention_policy,
        delivery_policy, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        'monthly', 'delta_share', 'active', 3,
        $8::timestamptz + interval '21 days',
        '{"retentionDays":365}'::jsonb,
        '{"summary":"Latest plus three rolling refreshes through Delta Share."}'::jsonb,
        $8, $8, $9
      )
      ON CONFLICT (id) DO UPDATE SET
        buyer_org_id = EXCLUDED.buyer_org_id,
        dataset_id = EXCLUDED.dataset_id,
        contract_id = EXCLUDED.contract_id,
        private_offer_id = EXCLUDED.private_offer_id,
        current_dataset_version_id = EXCLUDED.current_dataset_version_id,
        cadence = EXCLUDED.cadence,
        delivery_channel = EXCLUDED.delivery_channel,
        state = EXCLUDED.state,
        rolling_window_versions = EXCLUDED.rolling_window_versions,
        next_refresh_at = EXCLUDED.next_refresh_at,
        retention_policy = EXCLUDED.retention_policy,
        delivery_policy = EXCLUDED.delivery_policy,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.subscription,
      ids.tenantOrg,
      ids.buyerOrg,
      ids.dataset,
      ids.buyerContract,
      ids.privateOffer,
      ids.datasetVersion,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO delivery (
        id, org_id, dataset_version_id, buyer_org_id, subscription_id, channel, receipt, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, 'delta_share',
        $6::jsonb, 'accepted', $7, $7, $8
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        buyer_org_id = EXCLUDED.buyer_org_id,
        subscription_id = EXCLUDED.subscription_id,
        channel = EXCLUDED.channel,
        receipt = EXCLUDED.receipt,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.delivery,
      ids.tenantOrg,
      ids.datasetVersion,
      ids.buyerOrg,
      ids.subscription,
      JSON.stringify({
        object: "s3://fixture/delivery/receipt-v1.parquet",
        packageManifestUri: "s3://fixture/manifests/receipt-v1/package-manifest.json",
        packageManifestArtifactId: ids.packageManifestArtifact,
        receiptHash: "sha256:fixture-delivery-receipt-v1",
        manifestHash: "sha256:fixture-package-manifest-v1",
        datasetVersionId: ids.datasetVersion,
        deliveredAt: FIXTURE_CREATED_AT,
        acceptedAt: FIXTURE_CREATED_AT,
        acceptedBy: FIXTURE_BUYER_EMAIL,
        acceptedByOrgId: ids.buyerOrg,
        signatureKeyId: ids.signingKey,
      }),
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO delta_manifest (
        id, org_id, subscription_id, dataset_version_id,
        previous_dataset_version_id, delivery_id, qa_report_id, state,
        manifest_uri, manifest_hash, added_records, updated_records,
        deleted_records, tombstoned_records, total_records, quality_score,
        rights_reverified, privacy_verified, deletion_notice_uri, summary,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'ready',
        's3://fixture/deltas/receipts-2026-05.json',
        'sha256:fixture-delta-manifest', 1250, 48, 4, 0, 51221,
        0.9440, true, true, NULL,
        '{"summary":"Monthly receipt feed increment with per-version QA, rights, and privacy verification."}'::jsonb,
        $8, $8, $9
      )
      ON CONFLICT (id) DO UPDATE SET
        subscription_id = EXCLUDED.subscription_id,
        dataset_version_id = EXCLUDED.dataset_version_id,
        previous_dataset_version_id = EXCLUDED.previous_dataset_version_id,
        delivery_id = EXCLUDED.delivery_id,
        qa_report_id = EXCLUDED.qa_report_id,
        state = EXCLUDED.state,
        manifest_uri = EXCLUDED.manifest_uri,
        manifest_hash = EXCLUDED.manifest_hash,
        added_records = EXCLUDED.added_records,
        updated_records = EXCLUDED.updated_records,
        deleted_records = EXCLUDED.deleted_records,
        tombstoned_records = EXCLUDED.tombstoned_records,
        total_records = EXCLUDED.total_records,
        quality_score = EXCLUDED.quality_score,
        rights_reverified = EXCLUDED.rights_reverified,
        privacy_verified = EXCLUDED.privacy_verified,
        deletion_notice_uri = EXCLUDED.deletion_notice_uri,
        summary = EXCLUDED.summary,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.deltaManifest,
      ids.tenantOrg,
      ids.subscription,
      ids.datasetVersion,
      ids.previousDatasetVersion,
      ids.delivery,
      fixtureId("qr", 1),
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO invoice (
        id, org_id, buyer_org_id, quote_id, stripe_invoice_id, amount_cents, currency, state,
        created_at, updated_at, created_by
      )
      VALUES ($1, $2, $3, $4, 'in_fixture_test', 990000, 'USD', 'open', $5, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        buyer_org_id = EXCLUDED.buyer_org_id,
        quote_id = EXCLUDED.quote_id,
        stripe_invoice_id = EXCLUDED.stripe_invoice_id,
        amount_cents = EXCLUDED.amount_cents,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.invoice,
      ids.tenantOrg,
      ids.buyerOrg,
      ids.quote,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO payout (
        id, org_id, supplier_org_id, stripe_transfer_id, amount_cents, currency,
        state, created_at, updated_at, created_by
      )
      VALUES ($1, $2, $3, 'tr_fixture_test', 240000, 'USD', 'held', $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        supplier_org_id = EXCLUDED.supplier_org_id,
        stripe_transfer_id = EXCLUDED.stripe_transfer_id,
        amount_cents = EXCLUDED.amount_cents,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.payout, ids.tenantOrg, ids.supplierOrg, FIXTURE_CREATED_AT, ids.operator]
  );

  for (const [index, build] of fixtureBuilds.entries()) {
    await query(
      client,
      `
        INSERT INTO cost_entry (
          id, org_id, build_id, category, amount_cents, currency, metadata,
          created_at, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5, 'USD',
          jsonb_build_object('unit', 'fixture_build', 'costBucket', $6::text),
          $7, $8
        )
        ON CONFLICT (id) DO UPDATE SET
          build_id = EXCLUDED.build_id,
          category = EXCLUDED.category,
          amount_cents = EXCLUDED.amount_cents,
          metadata = EXCLUDED.metadata
      `,
      [
        fixtureId("ce", index + 1),
        ids.tenantOrg,
        build.id,
        index === 0 ? "label_review" : "budget_baseline",
        build.usedCents,
        index === 0 ? "compute" : "other",
        FIXTURE_CREATED_AT,
        ids.operator,
      ]
    );
  }

  await query(
    client,
    `
      INSERT INTO alert (
        id, org_id, severity, title, target_type, target_id, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, 'critical', 'Fixture privacy review needs owner',
        'build', $3, 'open', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        severity = EXCLUDED.severity,
        title = EXCLUDED.title,
        target_type = EXCLUDED.target_type,
        target_id = EXCLUDED.target_id,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.alert, ids.tenantOrg, fixtureBuilds[1].id, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO integration (
        id, org_id, buyer_org_id, integration_scope, provider, display_name,
        encrypted_config, metadata, last_verified_at, state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'buyer_delivery', 'spaces', 'Iberian Retail delivery bucket',
        $4, '{"destination":"s3://buyer-fixture/caudals-deliveries","region":"eu-west-1","authMode":"cross-account role"}'::jsonb,
        $5, 'active', $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        buyer_org_id = EXCLUDED.buyer_org_id,
        integration_scope = EXCLUDED.integration_scope,
        provider = EXCLUDED.provider,
        display_name = EXCLUDED.display_name,
        encrypted_config = EXCLUDED.encrypted_config,
        metadata = EXCLUDED.metadata,
        last_verified_at = EXCLUDED.last_verified_at,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.integration,
      ids.tenantOrg,
      ids.buyerOrg,
      Buffer.from("fixture-config"),
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO integration (
        id, org_id, supplier_org_id, integration_scope, provider, display_name,
        encrypted_config, metadata, last_verified_at, state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'supplier_payout', 'stripe_connect', 'Med Data Coop Stripe Connect',
        $4,
        '{"accountStatus":"restricted","payoutSchedule":"manual","pendingRequirements":["external_account"],"dashboardMode":"test","accountId":"acct_fixture_supplier"}'::jsonb,
        $5, 'active', $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        supplier_org_id = EXCLUDED.supplier_org_id,
        integration_scope = EXCLUDED.integration_scope,
        provider = EXCLUDED.provider,
        display_name = EXCLUDED.display_name,
        encrypted_config = EXCLUDED.encrypted_config,
        metadata = EXCLUDED.metadata,
        last_verified_at = EXCLUDED.last_verified_at,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.supplierPayoutIntegration,
      ids.tenantOrg,
      ids.supplierOrg,
      Buffer.from("fixture-stripe-connect-config"),
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );

  await query(
    client,
    `
      INSERT INTO signing_key (
        id, org_id, public_key, encrypted_private_key, algorithm, state,
        created_at, updated_at, created_by
      )
      VALUES ($1, $2, 'ed25519-fixture-public-key', $3, 'Ed25519', 'active', $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        public_key = EXCLUDED.public_key,
        encrypted_private_key = EXCLUDED.encrypted_private_key,
        algorithm = EXCLUDED.algorithm,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.signingKey, ids.tenantOrg, Buffer.from("fixture-private-key"), FIXTURE_CREATED_AT, ids.operator]
  );
}

async function seedEscalationCases(client: PoolClient) {
  await query(
    client,
    `
      INSERT INTO escalation_case (
        id,
        org_id,
        title,
        escalation_kind,
        severity,
        source_record_type,
        source_record_id,
        detail,
        runbook_key,
        routed_to,
        state,
        sla_due_at,
        created_at,
        updated_at,
        created_by
      )
      VALUES (
        $1,
        $2,
        'Supplier delivery failure - retail receipts sample',
        'supplier_delivery_failure',
        'critical',
        'delivery',
        $3,
        'Supplier sample delivery is late and the buyer pilot date is at risk.',
        NULL,
        NULL,
        'triaged',
        now() + interval '4 hours',
        $4,
        $4,
        $5
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        escalation_kind = EXCLUDED.escalation_kind,
        severity = EXCLUDED.severity,
        source_record_type = EXCLUDED.source_record_type,
        source_record_id = EXCLUDED.source_record_id,
        detail = EXCLUDED.detail,
        runbook_key = EXCLUDED.runbook_key,
        routed_to = EXCLUDED.routed_to,
        state = EXCLUDED.state,
        sla_due_at = EXCLUDED.sla_due_at,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [
      ids.escalationCase,
      ids.tenantOrg,
      ids.delivery,
      FIXTURE_CREATED_AT,
      ids.operator,
    ]
  );
}

async function seedOperatorElevation(client: PoolClient) {
  await query(
    client,
    `
      INSERT INTO operator_elevation (
        id, org_id, operator_id, scope, reason, state, expires_at,
        metadata, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'production_db',
        'Fixture JIT elevation for authenticated Operator Console smoke tests',
        'active',
        now() + interval '2 hours',
        '{"fixture":true}'::jsonb,
        now(), now(), $3
      )
      ON CONFLICT (id) DO UPDATE SET
        scope = EXCLUDED.scope,
        reason = EXCLUDED.reason,
        state = 'active',
        expires_at = EXCLUDED.expires_at,
        metadata = EXCLUDED.metadata,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.operatorElevation, ids.tenantOrg, ids.operator]
  );
}

async function seedComplianceControlScopes(client: PoolClient) {
  const controls = [
    {
      id: ids.accessControlScope,
      key: "access-control-jit-optional-mfa",
      title: "Operator access, optional MFA, and JIT elevation",
      family: "identity_access",
      state: "ready",
      status: "implemented",
      soc2: ["CC6.1", "CC6.2", "CC7.2"],
      iso27001: ["A.5.15", "A.5.16", "A.8.2"],
      evidence: [
        { type: "operator_security_status", command: "npm run operator:security-status" },
        { type: "audit_event", targetType: "operator_elevation" },
      ],
      linked: [
        { type: "operator_elevation", id: ids.operatorElevation },
        { type: "audit_event", id: fixtureId("ae", 6) },
      ],
      boundary:
        "Better Auth operator identities, password-only operator access, optional MFA/passkeys, RLS, and audited production DB JIT elevation.",
    },
    {
      id: ids.auditLoggingScope,
      key: "audit-logging-privileged-actions",
      title: "Privileged action audit logging and retention scope",
      family: "governance",
      state: "ready",
      status: "implemented",
      soc2: ["CC7.2", "CC7.3", "CC8.1"],
      iso27001: ["A.5.28", "A.8.15", "A.8.16"],
      evidence: [
        { type: "audit_event", targetType: "operator_record" },
        { type: "audit_event", targetType: "release_documentation_bundle" },
      ],
      linked: [
        { type: "release_documentation_bundle", id: ids.releaseDocumentationBundle },
        { type: "signing_key", id: ids.signingKey },
      ],
      boundary:
        "Operator Console mutations, state transitions, delivery signing, release documentation, and audit-event export scope.",
    },
    {
      id: ids.dataProtectionScope,
      key: "data-protection-dataset-packaging",
      title: "Dataset protection, PII treatment, and release evidence",
      family: "data_protection",
      state: "ready",
      status: "implemented",
      soc2: ["CC6.7", "CC6.8", "CC9.2"],
      iso27001: ["A.5.34", "A.8.10", "A.8.11"],
      evidence: [
        { type: "pii_map", id: ids.piiMap },
        { type: "release_documentation_bundle", id: ids.releaseDocumentationBundle },
        { type: "manifest_artifact", id: ids.packageManifestArtifact },
        { type: "delivery", id: ids.delivery },
      ],
      linked: [
        { type: "dataset_version", id: ids.datasetVersion },
        { type: "pii_map", id: ids.piiMap },
        { type: "manifest_artifact", id: ids.packageManifestArtifact },
        { type: "delivery", id: ids.delivery },
      ],
      boundary:
        "Dataset build artifacts, PII findings, privacy treatments, release docs, and buyer delivery evidence.",
    },
    {
      id: ids.incidentResponseScope,
      key: "incident-response-runbooks-alerts",
      title: "Security incident response and operator escalation scope",
      family: "incident_response",
      state: "scoped",
      status: "partial",
      soc2: ["CC7.3", "CC7.4", "CC7.5"],
      iso27001: ["A.5.24", "A.5.25", "A.5.26"],
      evidence: [
        { type: "alert", id: ids.alert },
        { type: "runbook", id: "R-08" },
      ],
      linked: [
        { type: "alert", id: ids.alert },
        { type: "operator_elevation", id: ids.operatorElevation },
      ],
      boundary:
        "Operator alerts, escalation review, restore checklist, and security-event triage for the current VPS deployment.",
    },
  ] as const;

  for (const control of controls) {
    await query(
      client,
      `
        INSERT INTO compliance_control_scope (
          id, org_id, control_key, title, control_family,
          framework_mappings, scope_boundary, owner_operator_id,
          evidence_sources, linked_records, implementation_status,
          risk_notes, review_cadence, next_review_at, scoped_at,
          approved_at, state, created_at, updated_at, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5,
          jsonb_build_object(
            'soc2', jsonb_build_object('criteria', $6::text[]),
            'iso27001', jsonb_build_object('controls', $7::text[])
          ),
          $8, $9, $10::jsonb, $11::jsonb, $12,
          $13, 'quarterly', $14::timestamptz + interval '90 days',
          $14, CASE WHEN $15 = 'ready' THEN $14 ELSE NULL END,
          $15, $14, $14, $9
        )
        ON CONFLICT (id) DO UPDATE SET
          control_key = EXCLUDED.control_key,
          title = EXCLUDED.title,
          control_family = EXCLUDED.control_family,
          framework_mappings = EXCLUDED.framework_mappings,
          scope_boundary = EXCLUDED.scope_boundary,
          owner_operator_id = EXCLUDED.owner_operator_id,
          evidence_sources = EXCLUDED.evidence_sources,
          linked_records = EXCLUDED.linked_records,
          implementation_status = EXCLUDED.implementation_status,
          risk_notes = EXCLUDED.risk_notes,
          review_cadence = EXCLUDED.review_cadence,
          next_review_at = EXCLUDED.next_review_at,
          scoped_at = EXCLUDED.scoped_at,
          approved_at = EXCLUDED.approved_at,
          state = EXCLUDED.state,
          updated_at = EXCLUDED.updated_at,
          deleted_at = NULL
      `,
      [
        control.id,
        ids.tenantOrg,
        control.key,
        control.title,
        control.family,
        control.soc2,
        control.iso27001,
        control.boundary,
        ids.operator,
        JSON.stringify(control.evidence),
        JSON.stringify(control.linked),
        control.status,
        "Fixture scoping evidence; formal certification remains out of scope.",
        FIXTURE_CREATED_AT,
        control.state,
      ]
    );
  }
}

async function seedAudit(client: PoolClient) {
  const baseAuditEvents = [
    [fixtureId("ae", 1), "build", fixtureBuilds[0].id, "state_transition", { from_state: "packaging", to_state: "delivered" }],
    [fixtureId("ae", 2), "license_clause", ids.licenseClause, "license_review", { verdict: "approved" }],
    [fixtureId("ae", 3), "dataset_version", ids.datasetVersion, "delivery_signed", { signer: ids.signingKey }],
    [fixtureId("ae", 4), "dsar", ids.dsarRequest, "state_transition", { from_state: "received", to_state: "identity_verified" }],
    [fixtureId("ae", 5), "payout", ids.payout, "payout_hold_review", { reason: "fixture commercial control" }],
    [fixtureId("ae", 6), "operator_elevation", ids.operatorElevation, "operator_elevation.granted", { scope: "production_db", reason: "fixture JIT elevation" }],
    [fixtureId("ae", 7), "modality_contract", ids.modalityContract, "state_transition", { from_state: "draft", to_state: "review" }],
    [fixtureId("ae", 8), "enrichment_manifest", ids.enrichmentManifest, "state_transition", { from_state: "draft", to_state: "review" }],
    [fixtureId("ae", 9), "active_learning_loop", ids.activeLearningLoop, "state_transition", { from_state: "sampling", to_state: "review" }],
    [fixtureId("ae", 10), "cleanlab_qa_pass", ids.cleanlabQaPass, "state_transition", { from_state: "scanning", to_state: "review" }],
    [fixtureId("ae", 11), "subscription", ids.subscription, "state_transition", { from_state: "draft", to_state: "active" }],
    [fixtureId("ae", 12), "delta_manifest", ids.deltaManifest, "state_transition", { from_state: "validating", to_state: "ready" }],
    [fixtureId("ae", 13), "modality_contract", ids.timeSeriesModalityContract, "state_transition", { from_state: "draft", to_state: "review" }],
    [fixtureId("ae", 14), "release_documentation_bundle", ids.releaseDocumentationBundle, "state_transition", { from_state: "approved", to_state: "published" }],
    [fixtureId("ae", 15), "compliance_control_scope", ids.accessControlScope, "state_transition", { from_state: "evidence_review", to_state: "ready" }],
    [fixtureId("ae", 16), "delivery", ids.delivery, "state_transition", { from_state: "downloaded", to_state: "accepted", accepted_by: FIXTURE_BUYER_EMAIL, package_manifest_artifact_id: ids.packageManifestArtifact }],
    [fixtureId("ae", 17), "manifest_artifact", ids.packageManifestArtifact, "state_transition", { from_state: "approved", to_state: "published", artifact_type: "package_manifest" }],
    [fixtureId("ae", 18), "dataset_partition", ids.goldDatasetPartition, "partition_promoted", { layer: "gold", content_hash: "sha256:fixture-gold-receipts-v1" }],
    [fixtureId("ae", 19), "compliance_control_scope", ids.dataProtectionScope, "state_transition", { from_state: "evidence_review", to_state: "ready", evidence: "representative_delivery_package" }],
  ] as const;
  const buildAuditEvents = fixtureBuilds.map((build, index) => [
    fixtureId("ae", 100 + index),
    "build",
    build.id,
    "build_gate_summary",
    {
      gates: gateKeys.map((gate, gateIndex) => ({
        gate,
        verdict: build.gates[gateIndex],
      })),
      state: build.state,
    },
  ] as const);
  const auditEvents = [...baseAuditEvents, ...buildAuditEvents];

  for (const [index, event] of auditEvents.entries()) {
    await query(
      client,
      `
        INSERT INTO audit_event (
          id, org_id, actor_id, action, target_type, target_id, metadata, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7::jsonb,
          $8::timestamptz + ($9::int * interval '1 minute')
        )
        ON CONFLICT (id, created_at) DO UPDATE SET
          action = EXCLUDED.action,
          target_type = EXCLUDED.target_type,
          target_id = EXCLUDED.target_id,
          metadata = EXCLUDED.metadata
      `,
      [
        event[0],
        ids.tenantOrg,
        ids.operator,
        event[3],
        event[1],
        event[2],
        JSON.stringify(event[4]),
        FIXTURE_CREATED_AT,
        index,
      ]
    );
  }
}
