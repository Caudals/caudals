import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { sourceSchema, type CefCase } from "../contracts/cases";
import { sha256, withContentHash } from "../contracts/hashing";
import { EvalError, PlanLimitError } from "../domain/errors";
import { withTenant } from "../repositories/db";
import { plansV2For } from "../../billing/overrides";
import { freezeSuite, idempotent, type EvidenceScope } from "../repositories/evidence";
import { objectKey, sealObject } from "../storage/private";
import { SECTOR_PACK_MIN_PUBLISHED_ITEMS } from "./flags";
import { itemProblems, packItemSchema, packMetaSchema, questionFingerprint, validatePackFile, type PackItemInput, type RightsKind } from "./schema";
import { isSector, type Sector } from "./sectors";
import { appendCases, groundedCase, setQuestions, workingSet } from "./suite-append";

/**
 * Sector packs (launch L-25). Pack data is platform data: staff and experts
 * work on it outside any workspace (an empty tenant context), and every write
 * is a SECURITY DEFINER function that checks the actor and refuses to run
 * inside a workspace. Workspaces read published versions only (RLS) and copy
 * their questions into a test set with `sector_generic` provenance.
 */

const platform = (actorId: string) => ({ orgId: "", actorId });

export type PackRole = { staff: boolean; expert: boolean; reviewer: boolean };

/** What the actor may do with packs: staff (platform role), expert (verified profile), reviewer (eligible expert). */
export function packRole(actorId: string, platformRole: string | null): Promise<PackRole> {
  return withTenant(platform(actorId), async (db) => {
    const row = (await db.query("SELECT evals.sector_pack_expert_profile(false) AS expert, evals.sector_pack_expert_profile(true) AS reviewer")).rows[0];
    return { staff: platformRole === "operator" || platformRole === "platform_admin", expert: !!row?.expert, reviewer: !!row?.reviewer };
  });
}

export function requirePackAuthor(role: PackRole) {
  if (!role.staff && !role.expert) throw new EvalError("SCOPE_DENIED", 404);
}

/** Database errors from the pack functions, as the API's own codes. */
function translate(error: unknown): never {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  if (code === "42501") throw new EvalError("SCOPE_DENIED", 403, message || "Not allowed.");
  if (code === "55000") throw new EvalError("VERSION_CONFLICT", 409, message);
  if (code === "P0002") throw new EvalError("SCOPE_DENIED", 404);
  if (code === "23505") throw new EvalError("INPUT_INVALID", 409, /question/.test(message) ? "This question is already in the version." : "This key is already in the version.");
  if (code === "23514" || code === "22023" || code === "22007" || code === "22P02") throw new EvalError("INPUT_INVALID", 422, message || "Check the fields.");
  throw error;
}
async function call<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) { if (error instanceof EvalError) throw error; return translate(error); }
}

/* --------------------------------------------------------------- reads --- */

export type PackVersionSummary = {
  id: string; packId: string; version: number; status: "draft" | "in_review" | "published"; notes: string; createdAt: string; updatedAt: string;
  submittedAt: string | null; publishedAt: string | null; contentHash: string | null;
  items: number; approved: number; pending: number; changesRequested: number; rejected: number; oldestSource: string | null;
};
export type PackSummary = { id: string; sector: string; jurisdiction: string; language: string; domainPackId: string; title: { en: string; es: string }; summary: { en: string; es: string }; versions: PackVersionSummary[] };

const versionColumns = `v.id,v.pack_id AS "packId",v.version,v.status,v.notes,v.created_at AS "createdAt",v.updated_at AS "updatedAt",v.submitted_at AS "submittedAt",
  v.published_at AS "publishedAt",v.content_hash AS "contentHash",count(i.id)::int AS items,
  count(i.id) FILTER (WHERE i.review_status='approved')::int AS approved,count(i.id) FILTER (WHERE i.review_status='pending')::int AS pending,
  count(i.id) FILTER (WHERE i.review_status='changes_requested')::int AS "changesRequested",count(i.id) FILTER (WHERE i.review_status='rejected')::int AS rejected,
  to_char(min(i.source_retrieved_at),'YYYY-MM-DD') AS "oldestSource"`;

export function listPacks(actorId: string): Promise<PackSummary[]> {
  return withTenant(platform(actorId), async (db) => {
    const packs = (await db.query(`SELECT id,sector,jurisdiction,language,domain_pack_id AS "domainPackId",title,summary FROM evals.sector_pack ORDER BY sector,id`)).rows;
    const versions = (await db.query(`SELECT ${versionColumns} FROM evals.sector_pack_version v LEFT JOIN evals.sector_pack_item i ON i.pack_version_id=v.id
      GROUP BY v.id ORDER BY v.pack_id,v.version DESC`)).rows as PackVersionSummary[];
    return packs.map((pack) => ({ ...pack, versions: versions.filter((version) => version.packId === pack.id) }));
  });
}

export type PackItemView = {
  id: string; key: string; scope: "sector_generic"; topic: string; language: string; question: string; questionEn: string | null; expected: string; keyFacts: string[];
  severity: CefCase["severity"]; difficulty: CefCase["difficulty"]; answerability: CefCase["reference"]["answerability"];
  source: { url: string; title: string; publisher: string; locator: string; excerpt: string; retrievedAt: string; asOf: string | null };
  rights: { kind: RightsKind; basis: string; licenceRef: string | null };
  authorId: string; authorNote: string; updatedBy: string;
  review: { status: "pending" | "approved" | "changes_requested" | "rejected"; reviewerId: string | null; reviewerProfileId: string | null; reviewedAt: string | null; note: string | null };
  contentHash: string; updatedAt: string;
  stats: { workspaces: number; results: number; passed: number | null; partial: number | null; failed: number | null } | null;
};

function itemView(row: Record<string, unknown>): PackItemView {
  return {
    id: String(row.id), key: String(row.item_key), scope: "sector_generic", topic: String(row.topic), language: String(row.language), question: String(row.question),
    questionEn: (row.question_en as string | null) ?? null, expected: String(row.expected), keyFacts: row.key_facts as string[],
    severity: row.severity as PackItemView["severity"], difficulty: row.difficulty as PackItemView["difficulty"], answerability: row.answerability as PackItemView["answerability"],
    source: { url: String(row.source_url), title: String(row.source_title), publisher: String(row.source_publisher), locator: String(row.source_locator), excerpt: String(row.source_excerpt),
      retrievedAt: String(row.retrieved), asOf: (row.as_of as string | null) ?? null },
    rights: { kind: row.rights_kind as RightsKind, basis: String(row.rights_basis), licenceRef: (row.licence_ref as string | null) ?? null },
    authorId: String(row.author_id), authorNote: String(row.author_note ?? ""), updatedBy: String(row.updated_by),
    review: { status: row.review_status as PackItemView["review"]["status"], reviewerId: (row.reviewer_id as string | null) ?? null, reviewerProfileId: (row.reviewer_profile_id as string | null) ?? null,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string).toISOString() : null, note: (row.review_note as string | null) ?? null },
    contentHash: String(row.content_hash), updatedAt: new Date(row.updated_at as string).toISOString(),
    stats: null,
  };
}

const itemColumns = `i.*,to_char(i.source_retrieved_at,'YYYY-MM-DD') AS retrieved,to_char(i.source_as_of,'YYYY-MM-DD') AS as_of`;

/** One version with its items and (for staff and experts) the anonymous per-item results. */
export function getPackVersion(actorId: string, versionId: string, role: PackRole) {
  return withTenant(platform(actorId), async (db) => {
    const version = (await db.query(`SELECT ${versionColumns} FROM evals.sector_pack_version v LEFT JOIN evals.sector_pack_item i ON i.pack_version_id=v.id WHERE v.id=$1 GROUP BY v.id`, [versionId])).rows[0] as PackVersionSummary | undefined;
    if (!version) throw new EvalError("SCOPE_DENIED", 404);
    const pack = (await db.query(`SELECT id,sector,jurisdiction,language,domain_pack_id AS "domainPackId",title,summary FROM evals.sector_pack WHERE id=$1`, [version.packId])).rows[0];
    const items = (await db.query(`SELECT ${itemColumns} FROM evals.sector_pack_item i WHERE i.pack_version_id=$1 ORDER BY i.topic,i.item_key`, [versionId])).rows.map(itemView);
    if (role.staff || role.expert) {
      const stats = new Map((await db.query("SELECT * FROM evals.sector_pack_item_stats($1)", [versionId])).rows.map((row) => [row.item_key as string, row]));
      for (const item of items) {
        const row = stats.get(item.key);
        if (row) item.stats = { workspaces: row.workspaces, results: row.results, passed: row.passed, partial: row.partial, failed: row.failed };
      }
    }
    return { pack, version, items, minPublished: SECTOR_PACK_MIN_PUBLISHED_ITEMS };
  });
}

/* -------------------------------------------------------------- writes --- */

async function saveItem(db: PoolClient, versionId: string, item: PackItemInput) {
  return (await db.query("SELECT evals.sector_pack_item_save($1,$2,$3) AS id", [versionId, JSON.stringify(item), questionFingerprint(item.question)])).rows[0].id as string;
}

/** Open the next version of a pack (copying the newest published one when it exists). */
export function openPackVersion(actorId: string, packId: string, notes: string) {
  return call(() => withTenant(platform(actorId), async (db) => {
    const latest = (await db.query("SELECT id FROM evals.sector_pack_version WHERE pack_id=$1 AND status='published' ORDER BY version DESC LIMIT 1", [packId])).rows[0];
    const id = (await db.query("SELECT evals.sector_pack_version_open($1,$2,$3) AS id", [packId, notes, latest?.id ?? null])).rows[0].id as string;
    return { id };
  }));
}

/** Add or edit one item of an open version. */
export function savePackItem(actorId: string, versionId: string, raw: unknown) {
  const item = packItemSchema.parse(raw);
  return call(() => withTenant(platform(actorId), async (db) => {
    const pack = (await db.query("SELECT p.language FROM evals.sector_pack_version v JOIN evals.sector_pack p ON p.id=v.pack_id WHERE v.id=$1", [versionId])).rows[0];
    if (!pack) throw new EvalError("SCOPE_DENIED", 404);
    const full = { ...item, language: item.language ?? pack.language };
    const problems = itemProblems(full);
    if (problems.length) throw new EvalError("INPUT_INVALID", 422, problems.join(" "));
    return { id: await saveItem(db, versionId, full) };
  }));
}

export function removePackItem(actorId: string, itemId: string) {
  return call(() => withTenant(platform(actorId), async (db) => {
    await db.query("SELECT evals.sector_pack_item_remove($1)", [itemId]);
    return { removed: true };
  }));
}

export function reviewPackItem(actorId: string, itemId: string, decision: "approved" | "changes_requested" | "rejected", note: string | null) {
  return call(() => withTenant(platform(actorId), async (db) => {
    await db.query("SELECT evals.sector_pack_item_review($1,$2,$3)", [itemId, decision, note]);
    return { reviewed: true, decision };
  }));
}

/** Submit, return to draft or publish (staff). Publishing needs the minimum count of approved questions. */
export function transitionPackVersion(actorId: string, versionId: string, to: "draft" | "in_review" | "published") {
  return call(() => withTenant(platform(actorId), async (db) => {
    if (to === "published") {
      const counts = (await db.query("SELECT count(*)::int AS total,count(*) FILTER (WHERE review_status='approved')::int AS approved FROM evals.sector_pack_item WHERE pack_version_id=$1", [versionId])).rows[0];
      if (counts.approved < SECTOR_PACK_MIN_PUBLISHED_ITEMS) throw new EvalError("VERSION_CONFLICT", 409, `A pack is published with at least ${SECTOR_PACK_MIN_PUBLISHED_ITEMS} expert-approved questions; this version has ${counts.approved}.`);
      if (counts.approved !== counts.total) throw new EvalError("VERSION_CONFLICT", 409, "Remove or fix the questions that are not approved first.");
    }
    await db.query("SELECT evals.sector_pack_version_transition($1,$2)", [versionId, to]);
    return { status: to };
  }));
}

/**
 * Import a pack file (staff): the pack's description, then every item into
 * the pack's open version (a new draft if none is open). All or nothing; an
 * invalid file changes nothing and names every problem. Items keep their
 * review when their content is unchanged; an edited item goes back to
 * pending.
 */
export function importPackFile(actorId: string, raw: unknown) {
  const { file, items, problems } = validatePackFile(raw);
  if (problems.length) {
    throw new EvalError("INPUT_INVALID", 422, `The file has ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems.slice(0, 8).map((problem) => `#${problem.index}${problem.key ? ` (${problem.key})` : ""} ${problem.message}`).join(" · ")}`);
  }
  const meta = packMetaSchema.parse(file.pack);
  return call(() => withTenant(platform(actorId), async (db) => {
    await db.query("SELECT evals.sector_pack_save($1,$2,$3,$4,$5,$6,$7)", [meta.id, meta.sector, meta.jurisdiction, meta.language, meta.domainPackId, meta.title, meta.summary]);
    let version = (await db.query("SELECT id,status FROM evals.sector_pack_version WHERE pack_id=$1 AND status<>'published'", [meta.id])).rows[0];
    let opened = false;
    if (!version) {
      const latest = (await db.query("SELECT id FROM evals.sector_pack_version WHERE pack_id=$1 AND status='published' ORDER BY version DESC LIMIT 1", [meta.id])).rows[0];
      version = { id: (await db.query("SELECT evals.sector_pack_version_open($1,$2,$3) AS id", [meta.id, file.version.notes, latest?.id ?? null])).rows[0].id, status: "draft" };
      opened = true;
    }
    const before = new Map((await db.query("SELECT item_key,content_hash FROM evals.sector_pack_item WHERE pack_version_id=$1", [version.id])).rows.map((row) => [row.item_key as string, row.content_hash as string]));
    for (const item of items) await saveItem(db, version.id, item);
    const after = new Map((await db.query("SELECT item_key,content_hash FROM evals.sector_pack_item WHERE pack_version_id=$1", [version.id])).rows.map((row) => [row.item_key as string, row.content_hash as string]));
    const created = items.filter((item) => !before.has(item.key)).length;
    const updated = items.filter((item) => before.has(item.key) && before.get(item.key) !== after.get(item.key)).length;
    const counts = (await db.query("SELECT count(*)::int AS items,count(*) FILTER (WHERE review_status='pending')::int AS pending FROM evals.sector_pack_item WHERE pack_version_id=$1", [version.id])).rows[0];
    return { packId: meta.id, versionId: version.id as string, opened, created, updated, unchanged: items.length - created - updated, items: counts.items, pending: counts.pending };
  }));
}

/* ---------------------------------------------------- workspace settings --- */

export type LibrarySetting = { sector: Sector | null; monthlyQuestions: boolean; plan: string | null };

export function getLibrarySetting(scope: EvidenceScope): Promise<LibrarySetting> {
  return withTenant(scope, async (db) => {
    const row = (await db.query("SELECT sector,monthly_questions FROM evals.workspace_library_setting WHERE org_id=$1", [scope.orgId])).rows[0];
    const plan = (await db.query("SELECT plan FROM evals.workspace_entitlement WHERE org_id=$1", [scope.orgId])).rows[0]?.plan ?? null;
    return { sector: isSector(row?.sector) ? row.sector : null, monthlyQuestions: !!row?.monthly_questions, plan };
  });
}

export function setLibrarySetting(scope: EvidenceScope, input: { sector?: Sector | null; monthlyQuestions?: boolean }) {
  return call(() => withTenant(scope, async (db) => {
    const row = (await db.query("SELECT sector,monthly_questions FROM evals.set_workspace_library_setting($1,$2,$3)", [
      input.sector ?? null, input.monthlyQuestions ?? null, input.sector === null,
    ])).rows[0];
    return { sector: row.sector as Sector | null, monthlyQuestions: !!row.monthly_questions };
  }));
}

/* ------------------------------------------- sector questions in a set --- */

type PublishedPack = { packId: string; versionId: string; version: number; sector: string; title: { en: string; es: string }; summary: { en: string; es: string }; language: string; items: number; publishedAt: string };

async function publishedPacks(db: PoolClient): Promise<PublishedPack[]> {
  return (await db.query(`SELECT DISTINCT ON (p.id) p.id AS "packId",v.id AS "versionId",v.version,p.sector,p.title,p.summary,p.language,v.published_at AS "publishedAt",
      (SELECT count(*) FROM evals.sector_pack_item i WHERE i.pack_version_id=v.id)::int AS items
    FROM evals.sector_pack p JOIN evals.sector_pack_version v ON v.pack_id=p.id AND v.status='published'
    ORDER BY p.id,v.version DESC`)).rows as PublishedPack[];
}

/** Pack item keys already in the set's current questions. */
async function keysInSet(db: PoolClient, orgId: string, suiteId: string, caseRevisionIds: string[]) {
  if (!caseRevisionIds.length) return new Map<string, Set<string>>();
  const rows = (await db.query(`SELECT v.pack_id,i.item_key FROM evals.sector_pack_case_link l JOIN evals.sector_pack_item i ON i.id=l.pack_item_id
      JOIN evals.sector_pack_version v ON v.id=i.pack_version_id
    WHERE l.org_id=$1 AND l.suite_id=$2 AND l.case_revision_id=ANY($3::uuid[])`, [orgId, suiteId, caseRevisionIds])).rows;
  const byPack = new Map<string, Set<string>>();
  for (const row of rows) byPack.set(row.pack_id, (byPack.get(row.pack_id) ?? new Set()).add(row.item_key));
  return byPack;
}

/**
 * The "Add N sector questions" suggestion for a test set: the workspace's
 * sector, the sectors that have a published pack, and the published packs
 * for its sector with how many of their questions the set lacks.
 */
export function sectorSuggestion(scope: EvidenceScope, suiteId: string) {
  return withTenant(scope, async (db) => {
    const setting = (await db.query("SELECT sector FROM evals.workspace_library_setting WHERE org_id=$1", [scope.orgId])).rows[0];
    const sector = isSector(setting?.sector) ? setting.sector : null;
    const packs = await publishedPacks(db);
    const suite = (await db.query("SELECT draft FROM evals.suite WHERE org_id=$1 AND id=$2 AND archived_at IS NULL", [scope.orgId, suiteId])).rows[0];
    if (!suite) throw new EvalError("SCOPE_DENIED", 404);
    const ids = Array.isArray(suite.draft?.case_revisions) ? (suite.draft.case_revisions as Array<{ revision_id: string }>).map((item) => item.revision_id) : [];
    const present = await keysInSet(db, scope.orgId, suiteId, ids);
    const matching = sector ? packs.filter((pack) => pack.sector === sector) : [];
    const keys = matching.length ? (await db.query("SELECT pack_version_id,item_key FROM evals.sector_pack_item WHERE pack_version_id=ANY($1::uuid[])", [matching.map((pack) => pack.versionId)])).rows : [];
    return {
      sector,
      sectors: [...new Set(packs.map((pack) => pack.sector))].filter(isSector),
      packs: matching.map((pack) => {
        const inSet = present.get(pack.packId) ?? new Set<string>();
        const missing = keys.filter((row) => row.pack_version_id === pack.versionId && !inSet.has(row.item_key)).length;
        return { ...pack, missing, added: pack.items - missing };
      }),
    };
  });
}

const RIGHTS_TO_CEF: Record<RightsKind, "public_domain" | "licensed" | "caudals_owned"> = {
  public_official_text: "public_domain", public_sector_reuse: "licensed", licensed: "licensed", caudals_owned: "caudals_owned",
};
/** A source's rights: the most restrictive of its items (licensed, then Caudals-owned, then public domain). */
function sourceRights(kinds: RightsKind[]) {
  const mapped = kinds.map((kind) => RIGHTS_TO_CEF[kind]);
  return mapped.includes("licensed") ? "licensed" : mapped.includes("caudals_owned") ? "caudals_owned" : "public_domain";
}

type PackItemRow = Record<string, unknown> & { id: string; item_key: string };

/**
 * The pack version as a frozen source of the workspace project: one excerpt
 * per item (its citation line and verbatim excerpt), stored privately like any
 * other reference file. Reused when the same version is added again.
 */
async function packSource(db: PoolClient, scope: EvidenceScope, projectId: string, pack: { id: string; title: { en: string; es: string } }, version: { id: string; version: number; content_hash: string }, items: PackItemRow[]) {
  const existing = (await db.query(`SELECT sr.id,sr.document,a.export_path,a.sha256,a.byte_size FROM evals.source_revision sr JOIN evals.source s ON (s.org_id,s.id)=(sr.org_id,sr.source_id)
      JOIN evals.artifact a ON (a.org_id,a.id)=(sr.org_id,sr.artifact_id)
    WHERE sr.org_id=$1 AND s.project_id=$2 AND s.archived_at IS NULL AND a.state='ready' AND a.expires_at>now()
      AND sr.document->'extensions'->'caudals.evals/sector-pack-source'->>'pack_version_id'=$3 LIMIT 1`, [scope.orgId, projectId, version.id])).rows[0];
  if (existing) {
    const document = sourceSchema.parse(existing.document);
    return { document, file: { path: existing.export_path as string, sha256: existing.sha256 as string, size_bytes: Number(existing.byte_size) } };
  }
  const title = `${pack.title.es} · v${version.version}`;
  let markdown = `# ${title}\n\nCaudals sector pack (sector_generic). Each excerpt is quoted from the public source it cites.\n`;
  const anchors: Array<{ id: string; excerpt: string; locator: string; key: string }> = [];
  for (const item of items) {
    const block = `Source URL: ${item.source_url}\n${item.source_publisher} · ${item.source_title} · ${item.source_locator} (${item.retrieved})\n\n${item.source_excerpt}`;
    markdown += "\n---\n\n";
    const start = markdown.length;
    markdown += block + "\n";
    anchors.push({ id: randomUUID(), excerpt: block, locator: `utf16:${start}:${start + block.length}`, key: item.item_key });
  }
  const bytes = Buffer.from(markdown, "utf8");
  const sourceId = randomUUID(), revisionId = randomUUID(), artifactId = randomUUID(), storageKey = objectKey(scope.orgId, artifactId, true), digest = sha256(bytes);
  const rights = sourceRights(items.map((item) => item.rights_kind as RightsKind));
  const path = `sources/sector-pack-${version.id}-${sourceId}.md`;
  await sealObject(storageKey, bytes, "text/markdown");
  await db.query(`INSERT INTO evals.artifact(id,org_id,project_id,export_path,visibility,object_key,sha256,byte_size,media_type,state,expires_at)
    VALUES($1,$2,$3,$4,'internal',$5,$6,$7,'text/markdown','ready',now()+interval '12 months')`, [artifactId, scope.orgId, projectId, path, storageKey, digest, bytes.length]);
  await db.query("INSERT INTO evals.source(id,org_id,project_id,title,rights) VALUES($1,$2,$3,$4,$5)", [sourceId, scope.orgId, projectId, title, rights]);
  const document = sourceSchema.parse(withContentHash({
    schema_version: "1.0" as const, source_id: sourceId, revision_id: revisionId, title,
    artifact: { path, sha256: digest, size_bytes: bytes.length, media_type: "text/markdown", visibility: "internal" as const },
    anchors: anchors.map(({ id, excerpt, locator }) => ({ id, excerpt, locator })),
    access: { candidate: false, judge: true, customer: true, public: false }, rights, created_at: new Date().toISOString(),
    extensions: {
      "caudals.evals/extraction": { version: "sector-pack-v1", anchor_space: "extracted_text", normalization: "none" },
      "caudals.evals/sector-pack-source": { scope: "sector_generic", pack_id: pack.id, pack_version_id: version.id, version: version.version, content_hash: version.content_hash, anchors: Object.fromEntries(anchors.map((anchor) => [anchor.key, anchor.id])) },
    },
  }));
  await db.query("INSERT INTO evals.source_revision(id,org_id,source_id,artifact_id,content_hash,document,extraction_version) VALUES($1,$2,$3,$4,$5,$6,'sector-pack-v1')",
    [revisionId, scope.orgId, sourceId, artifactId, document.content_hash, document]);
  for (const [ordinal, anchor] of anchors.entries()) {
    const [, start, end] = anchor.locator.split(":");
    await db.query("INSERT INTO evals.source_chunk(id,org_id,source_revision_id,ordinal,excerpt,anchor) VALUES($1,$2,$3,$4,$5,$6)",
      [anchor.id, scope.orgId, revisionId, ordinal, anchor.excerpt, { kind: "character_range", start: Number(start), end: Number(end), unit: "utf16_code_unit" }]);
  }
  return { document, file: { path, sha256: digest, size_bytes: bytes.length } };
}

/**
 * Add a published pack's questions to a test set (members who can write):
 * every question the set does not have yet, as new cases citing the pack's
 * frozen excerpts, with `sector_generic` provenance (author, expert reviewer,
 * source, rights) and a link to the pack item. The set gets a new draft
 * version; a set whose newest version was frozen is frozen again as a new
 * version.
 */
export async function addSectorQuestions(scope: EvidenceScope, suiteId: string, versionId: string, key: string) {
  const added = await withTenant(scope, (db) => idempotent(db, scope, `suite-sector-pack/${suiteId}`, key, { versionId }, async () => {
    const version = (await db.query("SELECT id,pack_id,version,status,content_hash FROM evals.sector_pack_version WHERE id=$1 AND status='published'", [versionId])).rows[0];
    if (!version) throw new EvalError("SCOPE_DENIED", 404);
    const pack = (await db.query("SELECT id,sector,jurisdiction,title FROM evals.sector_pack WHERE id=$1", [version.pack_id])).rows[0];
    const set = await workingSet(db, scope, suiteId);
    const items = (await db.query(`SELECT ${itemColumns} FROM evals.sector_pack_item i WHERE i.pack_version_id=$1 ORDER BY i.topic,i.item_key`, [versionId])).rows as PackItemRow[];
    const present = (await keysInSet(db, scope.orgId, suiteId, set.manifest.case_revisions.map((item) => item.revision_id))).get(pack.id) ?? new Set<string>();
    const asked = new Set((await setQuestions(db, scope.orgId, set.manifest)).map(questionFingerprint));
    const missing = items.filter((item) => !present.has(item.item_key) && !asked.has(questionFingerprint(String(item.question))));
    if (!missing.length) return { suiteId, added: 0, version: set.suite.version, freeze: false, packVersionId: versionId };
    const cap = (await db.query("SELECT max_tests_per_set FROM evals.workspace_entitlement WHERE org_id=$1", [scope.orgId])).rows[0]?.max_tests_per_set ?? null;
    const current = set.manifest.case_revisions.filter((item) => item.split !== "holdout").length;
    if (cap !== null && current + missing.length > Number(cap)) {
      // Plans v2 (L-14) answers with the typed limit and its dialog; otherwise the generic limit, as elsewhere.
      if (await plansV2For(db, scope.orgId)) throw new PlanLimitError("questions", scope.orgId, Number(cap));
      throw new EvalError("PLAN_LIMIT", 403, `This plan allows ${cap} questions per test set.`);
    }
    const source = await packSource(db, scope, set.suite.project_id, pack, version, items);
    const anchorFor = (source.document.extensions["caudals.evals/sector-pack-source"] as { anchors: Record<string, string> }).anchors;
    const now = new Date().toISOString();
    const cases = missing.map((item) => {
      const reviewed = item.review_status === "approved" && !!item.reviewer_id;
      return groundedCase(set.template, {
        question: String(item.question), expected: String(item.expected), keyFacts: item.key_facts as string[],
        severity: item.severity as CefCase["severity"], difficulty: item.difficulty as CefCase["difficulty"], answerability: item.answerability as CefCase["reference"]["answerability"],
        language: String(item.language), domain: pack.sector, jurisdiction: pack.jurisdiction, asOf: item.as_of ? `${item.as_of}T00:00:00.000Z` : null,
        tags: ["sector_generic", String(item.topic)], sourceRevisionId: source.document.revision_id, anchorId: anchorFor[item.item_key],
        provenance: {
          method: "human_authored", generator_revision: null, prompt_revision: null,
          evidence_level: reviewed ? "expert_reviewed" : "source_supported",
          author_ids: [String(item.author_id)], reviewer_ids: reviewed ? [String(item.reviewer_id)] : [],
          rights: RIGHTS_TO_CEF[item.rights_kind as RightsKind], created_at: now,
        },
        extensions: {
          "caudals.evals/sector-pack": {
            scope: "sector_generic", pack_id: pack.id, pack_version_id: versionId, pack_version: version.version, item_id: item.id, item_key: item.item_key,
            item_content_hash: String(item.content_hash), source_url: String(item.source_url), source_locator: String(item.source_locator),
            source_retrieved_at: String(item.retrieved), rights_kind: String(item.rights_kind), rights_basis: String(item.rights_basis),
            reviewer_profile_id: (item.reviewer_profile_id as string | null) ?? null, reviewed_at: item.reviewed_at ? new Date(item.reviewed_at as string).toISOString() : null,
            added_by: scope.actorId, added_at: now,
          },
        },
      });
    });
    const saved = await appendCases(db, scope, set, cases, [{ revisionId: source.document.revision_id, contentHash: source.document.content_hash, file: source.file }]);
    for (const [index, item] of missing.entries()) {
      await db.query("INSERT INTO evals.sector_pack_case_link(org_id,case_revision_id,pack_item_id,suite_id) VALUES($1,$2,$3,$4)", [scope.orgId, cases[index].revision_id, item.id, suiteId]);
    }
    await db.query("INSERT INTO evals.audit_event(org_id,actor_id,action,subject_id,details) VALUES($1,$2,'suite.sector_questions_added',$3,$4)",
      [scope.orgId, scope.actorId, suiteId, { pack_id: pack.id, pack_version_id: versionId, version: version.version, added: cases.length, draft_version: saved.version }]);
    return { suiteId, added: cases.length, version: saved.version, freeze: saved.freeze, packVersionId: versionId };
  }));
  return finishVersion(scope, suiteId, added, `${key}-freeze`);
}

/** Freeze a set whose newest version was frozen before the change, as its next version. */
export async function finishVersion<T extends { suiteId: string; version: number; freeze: boolean; added: number }>(scope: EvidenceScope, suiteId: string, result: T, key: string) {
  if (!result.freeze || !result.added) return { ...result, status: "draft" as const, suiteVersionId: null };
  try {
    const frozen = await freezeSuite(scope, suiteId, result.version, key);
    return { ...result, status: "frozen" as const, suiteVersionId: frozen.id as string };
  } catch (error) {
    // The questions stay in the draft; approving the set freezes it.
    if (error instanceof EvalError) return { ...result, status: "draft" as const, suiteVersionId: null, reason: error.message };
    throw error;
  }
}
