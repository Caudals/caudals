import type { Browser } from "playwright";
import { withTenant } from "../../lib/evals/repositories/db";
import { failWebsiteSource } from "../../lib/evals/repositories/evidence";
import { captureWebsiteContext } from "../../lib/evals/connectors/website-capture";
import { discoverWebsitePages } from "../../lib/evals/connectors/website-discovery";

type Tenant = { orgId: string; actorId: string };
type WebsiteJob = { id: string; source_id: string; start_url: string; page_limit: number; selected_urls: string[] | null };
type PreviewJob = { id: string; start_url: string; sitemap_url: string | null; path_prefix: string | null };

/** Reason codes a person can act on; anything else is reported as the site being unavailable. */
const KNOWN_REASONS = ["website_url_invalid", "destination_denied", "destination_invalid", "website_redirect_scope_denied", "website_extraction_limit"];
const PREVIEW_REASONS = ["website_url_invalid", "destination_denied", "destination_invalid", "website_page_unavailable", "website_robots_unavailable", "website_robots_disallowed", "website_pages_not_found"];

export async function processWebsiteSourceOne(options: {
  orgId: string;
  actorId: string;
  browser: Browser;
  destinationCheck: (url: string) => Promise<void>;
  onPage?: () => void;
}) {
  const tenant: Tenant = { orgId: options.orgId, actorId: options.actorId };
  const job = await withTenant(tenant, async (db) => {
    await db.query("UPDATE evals.website_source_job SET status='failed',reason_code='website_worker_interrupted',updated_at=now() WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '15 minutes' AND attempt_count>=3", [options.orgId]);
    await db.query("UPDATE evals.website_source_job SET status='queued',reason_code='website_worker_interrupted',updated_at=now() WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '15 minutes' AND attempt_count<3", [options.orgId]);
    const row = (await db.query(
      "SELECT id,source_id,start_url,page_limit,selected_urls FROM evals.website_source_job WHERE org_id=$1 AND status='queued' AND attempt_count<3 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      [options.orgId],
    )).rows[0] as WebsiteJob | undefined;
    if (!row) return undefined;
    await db.query("UPDATE evals.website_source_job SET status='running',attempt_count=attempt_count+1,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [options.orgId, row.id]);
    return row;
  });
  if (!job) return false;

  try {
    const capture = await captureWebsiteContext({
      browser: options.browser,
      startUrl: job.start_url,
      maxPages: job.page_limit,
      // An imported help centre reads exactly the pages the person selected (launch L-34).
      ...(job.selected_urls?.length ? { pages: job.selected_urls } : {}),
      destinationCheck: options.destinationCheck,
      onPage: async () => {
        options.onPage?.();
        await withTenant(tenant, (db) => db.query(
          "UPDATE evals.website_source_job SET updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'",
          [options.orgId, job.id],
        ));
      },
    });
    if (Buffer.byteLength(capture.markdown, "utf8") > 1_000_000) throw new Error("website_extraction_limit");
    await withTenant(tenant, (db) => db.query(
      job.selected_urls?.length
        ? "UPDATE evals.website_source_job SET status='captured',captured_text=$3,pages_read=$4,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'"
        : "UPDATE evals.website_source_job SET status='captured',captured_text=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'",
      job.selected_urls?.length ? [options.orgId, job.id, capture.markdown, capture.urls.length] : [options.orgId, job.id, capture.markdown],
    ));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const reasonCode = [...KNOWN_REASONS, ...(job.selected_urls?.length ? ["website_robots_unavailable"] : [])].includes(reason)
      ? reason : "website_capture_unavailable";
    await failWebsiteSource(tenant, job.id, reasonCode, reasonCode === "website_capture_unavailable");
  }
  return true;
}

/**
 * "Import help centre" (launch L-34): list the pages of a help centre from its
 * sitemap (or the submitted page's links) before anything is read. Runs in
 * the same isolated browser and egress path as the website reader.
 */
export async function processWebsitePreviewOne(options: {
  orgId: string;
  actorId: string;
  browser: Browser;
  destinationCheck: (url: string) => Promise<void>;
}) {
  const tenant: Tenant = { orgId: options.orgId, actorId: options.actorId };
  const job = await withTenant(tenant, async (db) => {
    await db.query("UPDATE evals.website_page_preview SET status=CASE WHEN attempt_count>=3 THEN 'failed' ELSE 'queued' END,reason_code='website_worker_interrupted',updated_at=now() WHERE org_id=$1 AND status='running' AND updated_at<now()-interval '5 minutes'", [options.orgId]);
    const row = (await db.query(
      "SELECT id,start_url,sitemap_url,path_prefix FROM evals.website_page_preview WHERE org_id=$1 AND status='queued' AND attempt_count<3 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
      [options.orgId],
    )).rows[0] as PreviewJob | undefined;
    if (!row) return undefined;
    await db.query("UPDATE evals.website_page_preview SET status='running',attempt_count=attempt_count+1,reason_code=NULL,updated_at=now() WHERE org_id=$1 AND id=$2", [options.orgId, row.id]);
    return row;
  });
  if (!job) return false;
  try {
    const found = await discoverWebsitePages({
      browser: options.browser, startUrl: job.start_url, sitemapUrl: job.sitemap_url, pathPrefix: job.path_prefix,
      destinationCheck: options.destinationCheck,
    });
    await withTenant(tenant, (db) => db.query(
      "UPDATE evals.website_page_preview SET status='ready',origin=$3,discovered_from=$4,pages=$5::jsonb,found_total=$6,robots_excluded=$7,outside_prefix=$8,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'",
      [options.orgId, job.id, found.origin, found.discoveredFrom, JSON.stringify(found.pages), found.foundTotal, found.robotsExcluded, found.outsidePrefix],
    ));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const reasonCode = PREVIEW_REASONS.includes(reason) ? reason : "website_capture_unavailable";
    await withTenant(tenant, (db) => db.query(
      "UPDATE evals.website_page_preview SET status=CASE WHEN $4 AND attempt_count<3 THEN 'queued' ELSE 'failed' END,reason_code=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'",
      [options.orgId, job.id, reasonCode, reasonCode === "website_capture_unavailable"],
    ));
  }
  return true;
}
