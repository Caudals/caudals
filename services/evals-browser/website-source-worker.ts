import type { Browser } from "playwright";
import { withTenant } from "../../lib/evals/repositories/db";
import { failWebsiteSource } from "../../lib/evals/repositories/evidence";
import { captureWebsiteContext } from "../../lib/evals/connectors/website-capture";

type Tenant = { orgId: string; actorId: string };
type WebsiteJob = { id: string; source_id: string; start_url: string; page_limit: number };

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
      "SELECT id,source_id,start_url,page_limit FROM evals.website_source_job WHERE org_id=$1 AND status='queued' AND attempt_count<3 ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
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
      "UPDATE evals.website_source_job SET status='captured',captured_text=$3,updated_at=now() WHERE org_id=$1 AND id=$2 AND status='running'",
      [options.orgId, job.id, capture.markdown],
    ));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const reasonCode = ["website_url_invalid", "destination_denied", "destination_invalid", "website_redirect_scope_denied", "website_extraction_limit"].includes(reason)
      ? reason : "website_capture_unavailable";
    await failWebsiteSource(tenant, job.id, reasonCode, reasonCode === "website_capture_unavailable");
  }
  return true;
}
