import { z } from "zod";
import { api } from "@/lib/evals/domain/http";
import { stripeMode } from "@/lib/billing/payments-config";
import { partnerStatement, requirePartnerSurface } from "@/lib/evals/partners/repository";
import { renderStatementCsv, statementFileName, statementMonth } from "@/lib/evals/partners/statement";

export const runtime = "nodejs";

/**
 * The monthly statement as CSV (`?month=YYYY-MM&mode=live|test`; default the
 * previous Madrid month and the running Stripe mode): referred payments and
 * reversals with the revenue share, allowance grants and client usage, from
 * the orders and the ledger. Partner members and platform admins.
 */
export const GET = api(async (request, identity) => {
  const url = new URL(request.url);
  const id = z.uuid().parse(url.pathname.split("/").at(-2));
  requirePartnerSurface(identity, id);
  const month = statementMonth(url.searchParams.get("month"));
  const requested = url.searchParams.get("mode");
  const mode = requested === "live" || requested === "test" ? requested : stripeMode();
  const statement = await partnerStatement(identity, id, month, mode === "live");
  const body = renderStatementCsv({ partner: statement.partner, month, mode, revenueShareBps: statement.revenueShareBps, generatedAt: new Date().toISOString() }, statement.rows);
  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${statementFileName(statement.partner, month, mode)}"`, "X-Content-Type-Options": "nosniff" } });
});
