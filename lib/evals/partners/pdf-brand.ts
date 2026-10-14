import "server-only";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTenant } from "../repositories/db";
import { readVerified } from "../storage/private";
import { brandSuffix, type PdfBrand } from "./brand";
import { partnerEnabled, partnersMode, type PartnersMode } from "./flags";
import { inspectLogo } from "./logo";

/**
 * White-label PDFs (launch L-28). The web app chooses the brand when it
 * queues a workspace PDF (`export_job.brand`): the workspace's live partner,
 * when PARTNERS_ENABLED opens that partner and it has a logo. The documents
 * worker re-checks the link and the logo hash in the database before it
 * reads the logo, so a forged or stale brand renders no logo.
 */
export async function pdfBrandFor(db: PoolClient, orgId: string, mode: PartnersMode = partnersMode()): Promise<PdfBrand | null> {
  if (!mode.admin) return null;
  const row = (await db.query<{ partner_id: string; logo_sha256: string }>("SELECT partner_id, logo_sha256 FROM evals.partner_pdf_brand($1)", [orgId])).rows[0];
  return row && partnerEnabled(mode, row.partner_id) ? { partnerId: row.partner_id, logoSha256: row.logo_sha256 } : null;
}

const brandSchema = z.object({ partner_id: z.uuid(), logo_sha256: z.string().regex(/^[0-9a-f]{64}$/) });

/** The partner block and the file suffix for a queued PDF, or null to render it without a logo. */
export async function resolveJobBrand(scope: { orgId: string; actorId: string }, brand: unknown, pool?: Pool) {
  const parsed = brandSchema.safeParse(brand);
  if (!parsed.success) return null;
  const { partner_id: partnerId, logo_sha256: logoSha256 } = parsed.data;
  const row = await withTenant(scope, async (db) => (await db.query<{ name: string; object_key: string; byte_size: number; media_type: string }>(
    "SELECT name, object_key, byte_size, media_type FROM evals.partner_pdf_logo($1,$2,$3)", [scope.orgId, partnerId, logoSha256])).rows[0], pool);
  if (!row) return null;
  const bytes = await readVerified(row.object_key, row.byte_size, logoSha256);
  const info = inspectLogo(bytes);
  return {
    partner: { name: row.name, logoDataUri: `data:${info.mediaType};base64,${bytes.toString("base64")}` },
    suffix: brandSuffix({ partnerId, logoSha256 }),
  };
}
