import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import { withTenant } from "../repositories/db";
import { idempotent } from "../repositories/identity";
import { requirePlatformAdmin, requireRecentAuthentication } from "../repositories/platform";
import { deletePrivateObject, readVerified, sealObject } from "../storage/private";
import { referralLinks } from "./codes";
import { partnerEnabled, partnersMode, type PartnersMode } from "./flags";
import { inspectLogo, LogoError, partnerLogoKey } from "./logo";
import type { StatementRow, StatementSection } from "./statement";

/**
 * Partner accounts (launch L-28, P-52). Every read and write goes through the
 * evals.partner_* SECURITY DEFINER functions of migration 103, which check the
 * actor in the database; this module adds the PARTNERS_ENABLED gate, the
 * platform-admin and recent sign-in checks for ops changes, and maps the
 * database's codes to API errors. Partner people work inside their clients'
 * workspaces through ordinary (partner-marked) memberships, so the workspace
 * APIs need nothing partner-specific.
 */
export type PartnerRole = "admin" | "member";
export type { PartnerScope } from "./scope";
type Scope = { orgId: string; actorId: string };

const UCR = 1_000_000;
const num = (value: unknown) => (value == null ? null : Number(value));
const iso = (value: unknown) => (value == null ? null : new Date(value as string | Date).toISOString());

const MESSAGES: Record<string, [number, string]> = {
  INPUT_INVALID: [422, "Check the supplied fields."],
  REASON_REQUIRED: [422, "Give a reason of 3 to 2,000 characters."],
  USER_NOT_FOUND: [422, "No verified Caudals account uses that address. Ask the person to sign up or accept an invitation first."],
  MEMBER_NOT_FOUND: [404, "That person is not in this partner account."],
  PARTNER_INACTIVE: [409, "This partner account is suspended or closed."],
  PARTNER_CLOSED: [409, "This partner account is closed."],
  PARTNER_CLIENT_LIMIT: [409, "This partner account has reached its number of client workspaces. Ask Caudals to raise it."],
  PARTNER_CLIENT_LINKED: [409, "That workspace is already managed by a partner."],
  PARTNER_CLIENT_ORPHAN: [409, "The client workspace would have no owner of its own. Add an owner from the client, or delete the workspace first."],
  PARTNER_CLIENTS_ACTIVE: [409, "Some client workspaces have no owner of their own. Give each an owner or delete it before closing the partner."],
  PARTNER_LAST_ADMIN: [409, "The partner needs another admin first: its client workspaces have no owner of their own."],
  PARTNER_CODE_LIMIT: [409, "A partner can have 20 active referral codes. Revoke one first."],
  PARTNER_ALLOWANCE_INACTIVE: [409, "The partner has no allowance in effect today."],
  PARTNER_ALLOWANCE_EXCEEDED: [409, "That grant would exceed this month's partner allowance."],
  IDEMPOTENCY_CONFLICT: [409, "This request key was already used for different data."],
  ACCOUNT_FROZEN: [409, "The client's credit account is frozen."],
};

/** Database codes (RAISE EXCEPTION '<CODE>') to API errors; unknown failures stay 503. */
export function partnerError(error: unknown): never {
  if (error instanceof EvalError || error instanceof z.ZodError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (message === "SCOPE_DENIED" || (error as { code?: string })?.code === "42501") throw new EvalError("SCOPE_DENIED", 404);
  const known = MESSAGES[message];
  if (known) throw new EvalError(message, known[0], known[1]);
  throw error;
}

/* --------------------------------------------------------------- gates --- */

/** Ops API (platform admins): on whenever PARTNERS_ENABLED is not off. */
export function requirePartnerOps(identity: EvalIdentity, mode: PartnersMode = partnersMode(), recent = true) {
  if (!mode.admin) throw new EvalError("NOT_FOUND", 404, "Not found.");
  if (recent) requireRecentAuthentication(identity);
  else requirePlatformAdmin(identity);
}

/**
 * A partner's own surfaces: on for that partner (PARTNERS_ENABLED), and for
 * platform admins while the ops API is on. The database checks membership.
 */
export function requirePartnerSurface(identity: EvalIdentity, partnerId: string, mode: PartnersMode = partnersMode()) {
  if (!/^[0-9a-f-]{36}$/i.test(partnerId)) throw new EvalError("SCOPE_DENIED", 404);
  const admin = identity.platformRole === "platform_admin" && mode.admin;
  if (!admin && !partnerEnabled(mode, partnerId)) throw new EvalError("NOT_FOUND", 404, "Not found.");
}

const partnerScope = (identity: EvalIdentity): Scope => ({ orgId: "", actorId: identity.user.id });

async function access(db: PoolClient, partnerId: string, need: "member" | "admin") {
  return (await db.query<{ role: string | null }>("SELECT evals.partner_access($1,$2) AS role", [partnerId, need])).rows[0].role;
}

/* --------------------------------------------------------------- reads --- */

/** The partners a person belongs to (identity), or every partner for platform admins. */
export async function listPartners(identity: EvalIdentity, mode: PartnersMode = partnersMode()) {
  if (!mode.admin) throw new EvalError("NOT_FOUND", 404, "Not found.");
  return withTenant(partnerScope(identity), async (db) => {
    const rows = (await db.query(`SELECT p.id, p.name, p.status, p.created_at, (SELECT m.role FROM evals.partner_member m WHERE m.partner_id = p.id AND m.user_id = $1) AS role,
        (SELECT count(*)::integer FROM evals.partner_client c JOIN evals.workspace w ON w.id = c.org_id AND w.deleted_at IS NULL WHERE c.partner_id = p.id AND c.unlinked_at IS NULL) AS clients
      FROM evals.partner p ORDER BY p.status, p.name, p.id LIMIT 200`, [identity.user.id])).rows;
    // RLS returns every partner to platform admins; others only see their own (active) partners.
    return rows
      .filter((row) => identity.platformRole === "platform_admin" || (row.role && partnerEnabled(mode, row.id)))
      .map((row) => ({ id: row.id as string, name: row.name as string, status: row.status as string, role: (row.role ?? null) as PartnerRole | null, clients: Number(row.clients), createdAt: iso(row.created_at) }));
  }).catch(partnerError);
}

export type PartnerOverview = Awaited<ReturnType<typeof partnerOverview>>;

/** Everything the partner dashboard shows, read in one transaction under the actor's scope. */
export async function partnerOverview(identity: EvalIdentity, partnerId: string, options: { livemode: boolean; marketingOrigin: string; appOrigin: string; now?: Date }) {
  requirePartnerSurface(identity, partnerId);
  const period = madridPeriod(options.now ?? new Date());
  return withTenant(partnerScope(identity), async (db) => {
    const role = await access(db, partnerId, "member");
    const partner = (await db.query(`SELECT id, name, status, revenue_share_bps, agreement_note, max_clients, logo_sha256, logo_media_type,
        logo_bytes, logo_updated_at, created_at FROM evals.partner WHERE id = $1`, [partnerId])).rows[0];
    if (!partner) throw new EvalError("SCOPE_DENIED", 404);
    const members = (await db.query("SELECT user_id, email, name, role, created_at FROM evals.partner_members($1)", [partnerId])).rows;
    const clients = (await db.query("SELECT * FROM evals.partner_clients($1)", [partnerId])).rows;
    const codes = (await db.query(`SELECT id, code, label, created_at, revoked_at FROM evals.partner_referral_code
      WHERE partner_id = $1 ORDER BY revoked_at NULLS FIRST, created_at DESC, id LIMIT 100`, [partnerId])).rows;
    const referrals = (await db.query("SELECT * FROM evals.partner_referrals($1,$2)", [partnerId, options.livemode])).rows;
    const allowance = (await db.query("SELECT monthly_ucr, valid_from, valid_until FROM evals.partner_allowance WHERE partner_id = $1", [partnerId])).rows[0];
    const grants = (await db.query(`SELECT g.id, g.org_id, w.name AS workspace, g.period, g.amount_ucr, g.created_at
      FROM evals.partner_allowance_grant g JOIN evals.workspace w ON w.id = g.org_id
      WHERE g.partner_id = $1 ORDER BY g.created_at DESC, g.id LIMIT 20`, [partnerId])).rows;
    const granted = Number((await db.query("SELECT coalesce(sum(amount_ucr), 0) AS total FROM evals.partner_allowance_grant WHERE partner_id = $1 AND period = $2", [partnerId, period])).rows[0].total);
    const referred = referrals.map((row) => ({
      orgId: row.org_id as string, workspace: row.workspace as string, code: row.code as string, attributedVia: row.attributed_via as "signup" | "payment",
      attributedAt: iso(row.attributed_at), firstPaidAt: iso(row.first_paid_at), paidOrders: Number(row.paid_orders),
      // NULL until the workspace has paid in this mode: never an invented zero.
      revenueNetCents: num(row.revenue_net_cents), revenueShareCents: num(row.revenue_share_cents),
    }));
    const paying = referred.filter((row) => row.revenueNetCents != null);
    return {
      partner: {
        id: partner.id as string, name: partner.name as string, status: partner.status as string, revenueShareBps: Number(partner.revenue_share_bps),
        agreementNote: (partner.agreement_note ?? null) as string | null, maxClients: Number(partner.max_clients), createdAt: iso(partner.created_at),
        logo: partner.logo_sha256 ? { sha256: partner.logo_sha256 as string, mediaType: partner.logo_media_type as string, bytes: Number(partner.logo_bytes), updatedAt: iso(partner.logo_updated_at) } : null,
      },
      role: (role === "admin" || role === "member" ? role : null) as PartnerRole | null,
      platformAdmin: identity.platformRole === "platform_admin",
      livemode: options.livemode,
      members: members.map((row) => ({ userId: row.user_id as string, email: row.email as string, name: row.name as string, role: row.role as PartnerRole, since: iso(row.created_at) })),
      clients: clients.map((row) => ({
        orgId: row.org_id as string, name: row.name as string, access: row.access as "manage" | "work", origin: row.origin as "created" | "linked",
        plan: (row.plan ?? null) as string | null, linkedAt: iso(row.linked_at), myRole: (row.my_role ?? null) as string | null,
        lastActivity: iso(row.last_activity), evaluations: Number(row.evaluations), runsThisMonth: Number(row.runs_this_month),
        lastRun: row.last_run_status ? { status: row.last_run_status as string, at: iso(row.last_run_at) } : null,
        latestScore: num(row.latest_score), latestScored: num(row.latest_scored), reportAt: iso(row.report_at),
        availableCredits: row.available_ucr == null ? null : Number(row.available_ucr) / UCR,
        usedThisMonthCredits: Number(row.used_this_month_ucr) / UCR,
      })),
      codes: codes.map((row) => ({
        id: row.id as string, code: row.code as string, label: (row.label ?? null) as string | null, createdAt: iso(row.created_at), revokedAt: iso(row.revoked_at),
        links: referralLinks(row.code as string, { marketing: options.marketingOrigin, app: options.appOrigin }),
      })),
      referrals: referred,
      revenue: {
        // NULL until a referred workspace has paid in this mode.
        netCents: paying.length ? paying.reduce((total, row) => total + (row.revenueNetCents ?? 0), 0) : null,
        shareCents: paying.length ? paying.reduce((total, row) => total + (row.revenueShareCents ?? 0), 0) : null,
      },
      allowance: allowance ? {
        monthlyCredits: Number(allowance.monthly_ucr) / UCR, validFrom: String(allowance.valid_from instanceof Date ? allowance.valid_from.toISOString().slice(0, 10) : allowance.valid_from),
        validUntil: allowance.valid_until == null ? null : String(allowance.valid_until instanceof Date ? allowance.valid_until.toISOString().slice(0, 10) : allowance.valid_until),
        period, grantedCredits: granted / UCR, remainingCredits: Math.max(0, (Number(allowance.monthly_ucr) - granted) / UCR),
        grants: grants.map((row) => ({ id: row.id as string, orgId: row.org_id as string, workspace: row.workspace as string, period: row.period as string, credits: Number(row.amount_ucr) / UCR, at: iso(row.created_at) })),
      } : null,
    };
  }).catch(partnerError);
}

/** The Madrid calendar month, YYYY-MM (allowance periods and statements). */
export function madridPeriod(at: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit" }).formatToParts(at);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export async function partnerStatement(identity: EvalIdentity, partnerId: string, month: string, livemode: boolean) {
  requirePartnerSurface(identity, partnerId);
  if (!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)) throw new EvalError("INPUT_INVALID", 422, "Choose a month as YYYY-MM.");
  return withTenant(partnerScope(identity), async (db) => {
    await access(db, partnerId, "member");
    const partner = (await db.query("SELECT name, revenue_share_bps FROM evals.partner WHERE id = $1", [partnerId])).rows[0];
    const rows = (await db.query("SELECT * FROM evals.partner_statement($1,$2::date,$3)", [partnerId, `${month}-01`, livemode])).rows;
    return {
      partner: partner.name as string, revenueShareBps: Number(partner.revenue_share_bps),
      rows: rows.map((row): StatementRow => ({
        section: row.section as StatementSection, occurredAt: iso(row.occurred_at), orgId: row.org_id as string, workspace: row.workspace as string,
        reference: (row.reference ?? null) as string | null, detail: (row.detail ?? null) as string | null,
        netCents: num(row.net_cents), shareCents: num(row.share_cents), creditsUcr: num(row.credits_ucr), returnedUcr: num(row.returned_ucr),
      })),
    };
  }).catch(partnerError);
}

/** The logo's bytes for the dashboard preview (members and platform admins). */
export async function partnerLogo(identity: EvalIdentity, partnerId: string) {
  requirePartnerSurface(identity, partnerId);
  const row = await withTenant(partnerScope(identity), async (db) => {
    await access(db, partnerId, "member");
    return (await db.query("SELECT logo_object_key, logo_sha256, logo_bytes, logo_media_type FROM evals.partner WHERE id = $1", [partnerId])).rows[0];
  }).catch(partnerError);
  if (!row?.logo_object_key) throw new EvalError("SCOPE_DENIED", 404);
  return { bytes: await readVerified(row.logo_object_key, row.logo_bytes, row.logo_sha256), mediaType: row.logo_media_type as string, sha256: row.logo_sha256 as string };
}

/* ---------------------------------------------------- ops (platform admins) --- */

const reason = z.string().trim().min(3).max(2000);
export const createPartnerInput = z.strictObject({
  name: z.string().trim().min(1).max(160), revenueShareBps: z.int().min(0).max(10000).optional(),
  agreementNote: z.string().max(2000).optional(), maxClients: z.int().min(1).max(500).optional(), reason,
});
export async function createPartner(identity: EvalIdentity, body: unknown, key: string | null) {
  requirePartnerOps(identity);
  const input = createPartnerInput.parse(body);
  return withTenant(partnerScope(identity), (db) => idempotent(db, identity.user.id, "partners", key, input, async () => {
    const id = (await db.query<{ id: string }>("SELECT evals.partner_create($1,$2,$3,$4,$5) AS id",
      [input.name, input.revenueShareBps ?? null, input.agreementNote ?? null, input.maxClients ?? null, input.reason])).rows[0].id;
    return { id, name: input.name };
  })).catch(partnerError);
}

export const updatePartnerInput = z.strictObject({
  status: z.enum(["active", "suspended", "closed"]).optional(), revenueShareBps: z.int().min(0).max(10000).optional(),
  agreementNote: z.string().max(2000).optional(), maxClients: z.int().min(1).max(500).optional(), reason,
});
export async function updatePartner(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerOps(identity);
  const input = updatePartnerInput.parse(body);
  const row = await withTenant(partnerScope(identity), async (db) => (await db.query("SELECT * FROM evals.partner_update($1,$2,$3,$4,$5,$6)",
    [partnerId, input.status ?? null, input.revenueShareBps ?? null, input.agreementNote ?? null, input.maxClients ?? null, input.reason])).rows[0]).catch(partnerError);
  // A closed partner's logo object is deleted after the database forgot it.
  if (row.cleared_logo_key) await deletePrivateObject(row.cleared_logo_key).catch(() => console.error("partner_logo_delete_failed", { partner_id: partnerId }));
  return { id: partnerId, status: row.new_status as string, version: Number(row.new_version) };
}

export const memberInput = z.strictObject({ email: z.email().max(254), role: z.enum(["admin", "member"]), reason });
export async function addPartnerMember(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerOps(identity);
  const input = memberInput.parse(body);
  const userId = await withTenant(partnerScope(identity), async (db) =>
    (await db.query<{ id: string }>("SELECT evals.partner_add_member($1,$2,$3,$4) AS id", [partnerId, input.email.toLowerCase(), input.role, input.reason])).rows[0].id).catch(partnerError);
  return { partnerId, userId, role: input.role };
}

export async function removePartnerMember(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerOps(identity);
  const input = z.strictObject({ userId: z.string().min(1).max(255), reason }).parse(body);
  await withTenant(partnerScope(identity), (db) => db.query("SELECT evals.partner_remove_member($1,$2,$3)", [partnerId, input.userId, input.reason])).catch(partnerError);
  return { partnerId, userId: input.userId, removed: true };
}

export const linkInput = z.strictObject({ orgId: z.uuid(), access: z.enum(["manage", "work"]).default("work"), reason });
export async function linkPartnerClient(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerOps(identity);
  const input = linkInput.parse(body);
  const id = await withTenant(partnerScope(identity), async (db) =>
    (await db.query<{ id: string }>("SELECT evals.partner_link_client($1,$2,$3,$4) AS id", [partnerId, input.orgId, input.access, input.reason])).rows[0].id).catch(partnerError);
  return { id, partnerId, orgId: input.orgId, access: input.access };
}

export async function unlinkPartnerClient(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerOps(identity);
  const input = z.strictObject({ orgId: z.uuid(), reason }).parse(body);
  await withTenant(partnerScope(identity), (db) => db.query("SELECT evals.partner_unlink_client($1,$2,$3)", [partnerId, input.orgId, input.reason])).catch(partnerError);
  return { partnerId, orgId: input.orgId, unlinked: true };
}

export const allowanceInput = z.strictObject({
  monthlyCredits: z.int().min(0).max(1_000_000_000), validFrom: z.iso.date(), validUntil: z.iso.date().nullable().optional(), reason,
});
export async function setPartnerAllowance(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerOps(identity);
  const input = allowanceInput.parse(body);
  const row = await withTenant(partnerScope(identity), async (db) => (await db.query("SELECT * FROM evals.partner_set_allowance($1,$2,$3::date,$4::date,$5)",
    [partnerId, input.monthlyCredits, input.validFrom, input.validUntil ?? null, input.reason])).rows[0]).catch(partnerError);
  return { partnerId, monthlyCredits: Number(row.monthly_ucr) / UCR, validFrom: input.validFrom, validUntil: input.validUntil ?? null, version: Number(row.version) };
}

export const grantInput = z.strictObject({ orgId: z.uuid(), credits: z.int().min(1).max(1_000_000_000), reason, expiresAt: z.iso.datetime().optional() });
/** Credits from the partner's allowance into one of its clients (a billing.grant in that workspace's ledger). */
export async function grantPartnerAllowance(identity: EvalIdentity, partnerId: string, body: unknown, key: string | null) {
  requirePartnerOps(identity);
  if (!key || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(key)) throw new EvalError("IDEMPOTENCY_REQUIRED", 400, "Provide an Idempotency-Key of 8–120 letters, digits, dots, colons, dashes or underscores.");
  const input = grantInput.parse(body);
  const row = await withTenant({ orgId: input.orgId, actorId: identity.user.id }, async (db) => (await db.query("SELECT * FROM evals.partner_grant_allowance($1,$2,$3,$4,$5,$6)",
    [partnerId, input.orgId, input.credits, key, input.reason, input.expiresAt ?? null])).rows[0]).catch(partnerError);
  return { id: row.id as string, partnerId, orgId: input.orgId, period: row.period as string, credits: Number(row.amount_ucr) / UCR, ledgerEntryId: row.ledger_entry_id as string };
}

/* ---------------------------------------------------------- partner admins --- */

export async function createPartnerClient(identity: EvalIdentity, partnerId: string, body: unknown, key: string | null) {
  requirePartnerSurface(identity, partnerId);
  const { name } = z.strictObject({ name: z.string().trim().min(1).max(160) }).parse(body);
  if (!key || key.length < 8 || key.length > 160) throw new EvalError("IDEMPOTENCY_REQUIRED", 400, "Provide an Idempotency-Key of 8–160 characters.");
  const orgId = await withTenant(partnerScope(identity), async (db) =>
    (await db.query<{ id: string }>("SELECT evals.partner_create_client($1,$2,$3) AS id", [partnerId, name, key])).rows[0].id).catch(partnerError);
  return { orgId, name };
}

export async function createReferralCode(identity: EvalIdentity, partnerId: string, body: unknown, key: string | null, origins: { marketing: string; app: string }) {
  requirePartnerSurface(identity, partnerId);
  const { label } = z.strictObject({ label: z.string().trim().max(80).optional() }).parse(body);
  const row = await withTenant(partnerScope(identity), (db) => idempotent(db, identity.user.id, `partners/${partnerId}/codes`, key, { label: label ?? null }, async () =>
    (await db.query("SELECT id, code, label, created_at FROM evals.partner_create_code($1,$2)", [partnerId, label ?? null])).rows[0])).catch(partnerError);
  return { id: row.id as string, code: row.code as string, label: (row.label ?? null) as string | null, createdAt: iso(row.created_at), links: referralLinks(row.code, origins) };
}

export async function revokeReferralCode(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerSurface(identity, partnerId);
  const input = z.strictObject({ codeId: z.uuid(), reason }).parse(body);
  const row = await withTenant(partnerScope(identity), async (db) =>
    (await db.query("SELECT id, revoked_at FROM evals.partner_revoke_code($1,$2,$3)", [partnerId, input.codeId, input.reason])).rows[0]).catch(partnerError);
  return { id: row.id as string, revokedAt: iso(row.revoked_at) };
}

const logoKeyId = () => randomUUID();
/** A new logo: checked from its bytes, sealed under a fresh key, then recorded; the replaced object is deleted. */
export async function setPartnerLogo(identity: EvalIdentity, partnerId: string, body: unknown) {
  requirePartnerSurface(identity, partnerId);
  const { imageBase64 } = z.strictObject({ imageBase64: z.string().min(4).max(800_000) }).parse(body);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) throw new EvalError("INPUT_INVALID", 422, "Send the image as base64.");
  const bytes = Buffer.from(imageBase64, "base64");
  let info;
  try { info = inspectLogo(bytes); } catch (error) {
    if (error instanceof LogoError) {
      const messages = { LOGO_EMPTY: "The file is empty.", LOGO_TOO_LARGE: "Use a logo of at most 512 KB.", LOGO_TYPE: "Use a PNG or JPEG image.", LOGO_DIMENSIONS: "Use an image between 16 and 4,096 pixels a side." };
      throw new EvalError(error.code, 422, messages[error.code]);
    }
    throw error;
  }
  // Check access before writing anything to storage.
  await withTenant(partnerScope(identity), (db) => access(db, partnerId, "admin")).catch(partnerError);
  const key = partnerLogoKey(partnerId, logoKeyId()), sha256 = createHash("sha256").update(bytes).digest("hex");
  await sealObject(key, bytes, info.mediaType);
  let previous: string | null;
  try {
    previous = await withTenant(partnerScope(identity), async (db) => (await db.query<{ previous: string | null }>("SELECT evals.partner_set_logo($1,$2,$3,$4,$5) AS previous",
      [partnerId, key, sha256, bytes.length, info.mediaType])).rows[0].previous);
  } catch (error) {
    await deletePrivateObject(key).catch(() => undefined);
    partnerError(error);
  }
  if (previous && previous !== key) await deletePrivateObject(previous).catch(() => console.error("partner_logo_delete_failed", { partner_id: partnerId }));
  return { sha256, mediaType: info.mediaType, bytes: bytes.length, width: info.width, height: info.height };
}

export async function removePartnerLogo(identity: EvalIdentity, partnerId: string) {
  requirePartnerSurface(identity, partnerId);
  const previous = await withTenant(partnerScope(identity), async (db) =>
    (await db.query<{ previous: string | null }>("SELECT evals.partner_set_logo($1,NULL,NULL,NULL,NULL) AS previous", [partnerId])).rows[0].previous).catch(partnerError);
  if (previous) await deletePrivateObject(previous).catch(() => console.error("partner_logo_delete_failed", { partner_id: partnerId }));
  return { removed: Boolean(previous) };
}
