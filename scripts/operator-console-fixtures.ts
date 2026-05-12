import { Buffer } from "node:buffer";
import { config as loadEnv } from "dotenv";
import { hashPassword } from "better-auth/crypto";
import { Pool, type PoolClient } from "pg";

import { getDatabaseUrlFromEnv } from "@/lib/env/database-url";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export const FIXTURE_OPERATOR_EMAIL = "fixture.admin@caudals.local";
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
  datasetVersion: fixtureId("dv", 1),
  modalityContract: fixtureId("mc", 1),
  enrichmentManifest: fixtureId("em", 1),
  activeLearningLoop: fixtureId("ll", 1),
  activeLearningCandidate: fixtureId("ac", 1),
  cleanlabQaPass: fixtureId("cq", 1),
  cleanlabLabelIssue: fixtureId("li", 1),
  piiMap: fixtureId("pm", 1),
  catalogueListing: fixtureId("cl", 1),
  privateOffer: fixtureId("po", 1),
  samplePreviewAccess: fixtureId("pa", 1),
  quote: fixtureId("qt", 1),
  delivery: fixtureId("dl", 1),
  invoice: fixtureId("iv", 1),
  payout: fixtureId("py", 1),
  costEntry: fixtureId("ce", 1),
  alert: fixtureId("al", 1),
  integration: fixtureId("in", 1),
  signingKey: fixtureId("sk", 1),
  operatorElevation: fixtureId("oe", 1),
};

const fixtureBuilds = [
  {
    id: fixtureId("bd", 1),
    title: "Iberian retail receipts v3",
    state: "qa",
    etaOffset: "7 days",
    qScore: 0.91,
    budgetCents: 250000,
    usedCents: 184000,
    gates: ["pass", "pass", "pass", "pass", "pass", "pass", "review"],
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
    await seedOperatorElevation(client);
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
      INSERT INTO "auth_member" ("id", "organizationId", "userId", "role", "createdAt")
      VALUES ($1, $2, $3, 'admin', $4)
      ON CONFLICT ("id") DO UPDATE SET
        "organizationId" = EXCLUDED."organizationId",
        "userId" = EXCLUDED."userId",
        "role" = EXCLUDED."role"
    `,
    [ids.authMember, ids.authOrganization, ids.authUser, FIXTURE_CREATED_AT]
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
        id, org_id, contact_id, title, asset_summary, state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'Mediterranean supplier data room',
        'Receipts, route telemetry, crop imagery, and support-ticket exports',
        'full_active', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        asset_summary = EXCLUDED.asset_summary,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.supplierOpportunity, ids.tenantOrg, ids.supplierContact, FIXTURE_CREATED_AT, ids.operator]
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
        id, org_id, contract_id, name, modality, declared_volume, refresh_policy,
        sensitivity, rights_summary, state, created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, 'Iberian receipt and ticket corpus', 'document',
        '{"records":125000,"format":"pdf+json"}'::jsonb,
        'scheduled', 'pii',
        '{"ai_training":true,"requires_redaction":true}'::jsonb,
        'approved', $4, $4, $5
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        modality = EXCLUDED.modality,
        declared_volume = EXCLUDED.declared_volume,
        refresh_policy = EXCLUDED.refresh_policy,
        sensitivity = EXCLUDED.sensitivity,
        rights_summary = EXCLUDED.rights_summary,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.supplierAsset, ids.tenantOrg, ids.supplierContract, FIXTURE_CREATED_AT, ids.operator]
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
        $1, $2, $3, 'video', 'Lance index over MP4 chunks',
        '["duration_histogram","fps","codec","scene_change_density"]'::jsonb,
        '["temporal_dedup","shot_change_sampling","metadata_strip"]'::jsonb,
        '["face_blur","license_plate_blur","audio_track_pii_review"]'::jsonb,
        ARRAY['temporal_segment','bounding_box','keyframe'],
        '["temporal_coverage","frame_quality","privacy_residual"]'::jsonb,
        ARRAY['mp4_clips','per_frame_manifest','coco_video'],
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
      INSERT INTO enrichment_manifest (
        id, org_id, build_id, dataset_version_id, modality_contract_id,
        enrichment_class, added_columns, sources, source_license,
        source_version, computation_method, reproducer_uri, spot_check_rate,
        independence_passed, license_compatible, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, 'geospatial',
        '["h3_cell","admin_region"]'::jsonb,
        '["OSM boundaries 2026.05","Caudals silver coordinates"]'::jsonb,
        'ODbL-1.0', '2026.05',
        'H3 resolution 8 binning from silver-layer coordinates.',
        's3://fixture/manifests/enrichment-h3.json',
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
        'private',
        's3://fixture/previews/receipt-sample.jsonl',
        '{"gate":"nda_required","watermark":true}'::jsonb,
        'monthly',
        'evaluation',
        'review', $5, $5, $6
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
        id, org_id, buyer_opportunity_id, amount_cents, currency, state,
        created_at, updated_at, created_by
      )
      VALUES ($1, $2, $3, 990000, 'USD', 'sent', $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        buyer_opportunity_id = EXCLUDED.buyer_opportunity_id,
        amount_cents = EXCLUDED.amount_cents,
        currency = EXCLUDED.currency,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.quote, ids.tenantOrg, ids.buyerOpportunity, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO delivery (
        id, org_id, dataset_version_id, buyer_org_id, channel, receipt, state,
        created_at, updated_at, created_by
      )
      VALUES (
        $1, $2, $3, $4, 'signed_s3',
        '{"object":"s3://fixture/delivery/receipt-v1.parquet"}'::jsonb,
        'ready', $5, $5, $6
      )
      ON CONFLICT (id) DO UPDATE SET
        dataset_version_id = EXCLUDED.dataset_version_id,
        buyer_org_id = EXCLUDED.buyer_org_id,
        channel = EXCLUDED.channel,
        receipt = EXCLUDED.receipt,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.delivery, ids.tenantOrg, ids.datasetVersion, ids.buyerOrg, FIXTURE_CREATED_AT, ids.operator]
  );

  await query(
    client,
    `
      INSERT INTO invoice (
        id, org_id, quote_id, stripe_invoice_id, amount_cents, currency, state,
        created_at, updated_at, created_by
      )
      VALUES ($1, $2, $3, 'in_fixture_test', 990000, 'USD', 'open', $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        quote_id = EXCLUDED.quote_id,
        stripe_invoice_id = EXCLUDED.stripe_invoice_id,
        amount_cents = EXCLUDED.amount_cents,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.invoice, ids.tenantOrg, ids.quote, FIXTURE_CREATED_AT, ids.operator]
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

  await query(
    client,
    `
      INSERT INTO cost_entry (id, org_id, build_id, category, amount_cents, currency, metadata, created_at, created_by)
      VALUES ($1, $2, $3, 'label_review', 42000, 'USD', '{"unit":"batch"}'::jsonb, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        build_id = EXCLUDED.build_id,
        category = EXCLUDED.category,
        amount_cents = EXCLUDED.amount_cents,
        metadata = EXCLUDED.metadata
    `,
    [ids.costEntry, ids.tenantOrg, fixtureBuilds[0].id, FIXTURE_CREATED_AT, ids.operator]
  );

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
        id, org_id, provider, encrypted_config, state, created_at, updated_at, created_by
      )
      VALUES ($1, $2, 'spaces', $3, 'active', $4, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        provider = EXCLUDED.provider,
        encrypted_config = EXCLUDED.encrypted_config,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at,
        deleted_at = NULL
    `,
    [ids.integration, ids.tenantOrg, Buffer.from("fixture-config"), FIXTURE_CREATED_AT, ids.operator]
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

async function seedAudit(client: PoolClient) {
  const baseAuditEvents = [
    [fixtureId("ae", 1), "build", fixtureBuilds[0].id, "state_transition", { from_state: "labeling", to_state: "qa" }],
    [fixtureId("ae", 2), "license_clause", ids.licenseClause, "license_review", { verdict: "approved" }],
    [fixtureId("ae", 3), "dataset_version", ids.datasetVersion, "delivery_signed", { signer: ids.signingKey }],
    [fixtureId("ae", 4), "dsar", ids.dsarRequest, "state_transition", { from_state: "received", to_state: "identity_verified" }],
    [fixtureId("ae", 5), "payout", ids.payout, "payout_hold_review", { reason: "fixture commercial control" }],
    [fixtureId("ae", 6), "operator_elevation", ids.operatorElevation, "operator_elevation.granted", { scope: "production_db", reason: "fixture JIT elevation" }],
    [fixtureId("ae", 7), "modality_contract", ids.modalityContract, "state_transition", { from_state: "draft", to_state: "review" }],
    [fixtureId("ae", 8), "enrichment_manifest", ids.enrichmentManifest, "state_transition", { from_state: "draft", to_state: "review" }],
    [fixtureId("ae", 9), "active_learning_loop", ids.activeLearningLoop, "state_transition", { from_state: "sampling", to_state: "review" }],
    [fixtureId("ae", 10), "cleanlab_qa_pass", ids.cleanlabQaPass, "state_transition", { from_state: "scanning", to_state: "review" }],
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
