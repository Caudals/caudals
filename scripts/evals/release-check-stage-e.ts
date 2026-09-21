import { createPrivateKey } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Pool, type QueryResult } from "pg";
import { getSecretEnvValue } from "../../lib/env/secrets";

const REQUIRED_MIGRATIONS = ["043_evals_expert_work.sql", "044_evals_improvement_releases.sql"] as const;
const REQUIRED_IMMUTABLE_TRIGGERS = [
  "expert_submission_immutable",
  "expert_quality_immutable",
  "dataset_item_revision_immutable",
  "dataset_item_review_immutable",
  "dataset_release_immutable",
  "dataset_release_item_immutable",
  "intervention_validation_immutable",
] as const;

export type StageEReleaseInspection = {
  migrations: string[];
  runtimeRole: { name: string; superuser: boolean; bypassRls: boolean; login: boolean; ownedObjects: number } | null;
  immutableTriggers: string[];
  signingKey: string;
  featureEnabled: boolean;
};

export function assessStageERelease(input: StageEReleaseInspection) {
  const migrations = new Set(input.migrations);
  if (REQUIRED_MIGRATIONS.some((name) => !migrations.has(name))) throw new Error("Stage E migrations are incomplete.");
  const role = input.runtimeRole;
  if (!role || role.name !== "evals_runtime" || role.superuser || role.bypassRls || role.login || role.ownedObjects !== 0) {
    throw new Error("The Stage E runtime role must be NOLOGIN, NOSUPERUSER, NOBYPASSRLS and own no evaluation objects.");
  }
  const triggers = new Set(input.immutableTriggers);
  if (REQUIRED_IMMUTABLE_TRIGGERS.some((name) => !triggers.has(name))) throw new Error("Stage E immutable evidence triggers are incomplete.");
  let keyType: string | undefined;
  try { keyType = createPrivateKey(input.signingKey).asymmetricKeyType; }
  catch { throw new Error("The Stage E dataset signing key is invalid."); }
  if (keyType !== "ed25519") throw new Error("The Stage E dataset signing key must be Ed25519.");
  if (!input.featureEnabled) throw new Error("EVALS_EXPERT_WORK_ENABLED must be true only after every Stage E release gate passes.");
  return {
    status: "ready" as const,
    migrations: [...REQUIRED_MIGRATIONS],
    runtimeRole: role.name,
    ownedObjects: role.ownedObjects,
    immutableTriggerCount: REQUIRED_IMMUTABLE_TRIGGERS.length,
    featureEnabled: true as const,
    signingKeyType: "ed25519" as const,
  };
}

type Database = { query<T extends Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>> };

export async function inspectStageERelease(database: Database, signingKey: string, featureEnabled: boolean) {
  const [migrationResult, roleResult, ownershipResult, triggerResult] = await Promise.all([
    database.query<{ name: string }>("SELECT name FROM public.evals_migration_history WHERE name = ANY($1::text[]) ORDER BY name", [[...REQUIRED_MIGRATIONS]]),
    database.query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname='evals_runtime'"),
    database.query<{ count: number }>(`SELECT count(*)::int AS count FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname='evals' AND r.rolname='evals_runtime'`),
    database.query<{ tgname: string }>(`SELECT t.tgname FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='evals' AND NOT t.tgisinternal AND t.tgenabled <> 'D' AND t.tgname = ANY($1::text[])
      ORDER BY t.tgname`, [[...REQUIRED_IMMUTABLE_TRIGGERS]]),
  ]);
  const role = roleResult.rows[0];
  return assessStageERelease({
    migrations: migrationResult.rows.map((row) => row.name),
    runtimeRole: role ? {
      name: role.rolname, superuser: role.rolsuper, bypassRls: role.rolbypassrls,
      login: role.rolcanlogin, ownedObjects: ownershipResult.rows[0]?.count ?? -1,
    } : null,
    immutableTriggers: triggerResult.rows.map((row) => row.tgname),
    signingKey,
    featureEnabled,
  });
}

async function main() {
  const url = getSecretEnvValue("EVALS_MIGRATION_DATABASE_URL", { missingMessage: "EVALS_MIGRATION_DATABASE_URL(_FILE) is required for the read-only Stage E release inspection." });
  const signingKey = getSecretEnvValue("EVALS_DATASET_SIGNING_KEY", { missingMessage: "EVALS_DATASET_SIGNING_KEY(_FILE) is required for the Stage E release inspection." });
  if (!url || !signingKey) throw new Error("Stage E release configuration is incomplete.");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const result = await inspectStageERelease(pool, signingKey, process.env.EVALS_EXPERT_WORK_ENABLED === "true");
    console.log(JSON.stringify(result));
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Stage E release check failed.");
    process.exitCode = 1;
  });
}
