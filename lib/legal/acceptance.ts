import "server-only";

import type { Locale } from "@/lib/i18n/config";
import type { AcceptableDocument, AcceptanceContext } from "./versions";

/** The query surface of a `pg` client inside `withTenant`. */
type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<{ id?: string }> }>;
};

/**
 * Sign-up must include Terms and Privacy acceptance. Read on the server at
 * request time; off unless `SIGNUP_TERMS_REQUIRED=true` (launch L-01).
 */
export function signupTermsRequired(env: Record<string, string | undefined> = process.env) {
  return env.SIGNUP_TERMS_REQUIRED === "true";
}

/**
 * Records one acceptance row per document through
 * `evals.record_terms_acceptance` (migration 081). Call it inside the same
 * `withTenant` transaction as the action it belongs to, with the accepting
 * person as the tenant actor: the function records for `evals.actor_id()` and
 * refuses a workspace the actor is not a member of.
 */
export async function recordTermsAcceptance(
  db: Queryable,
  input: {
    orgId: string | null;
    documents: readonly { document: AcceptableDocument; version: string }[];
    context: AcceptanceContext;
    locale: Locale | null;
    requestId: string;
  },
): Promise<string[]> {
  const ids: string[] = [];
  for (const { document, version } of input.documents) {
    const { rows } = await db.query(
      "SELECT evals.record_terms_acceptance($1, $2, $3, $4, $5, $6) AS id",
      [input.orgId, document, version, input.context, input.locale, input.requestId],
    );
    if (rows[0]?.id) ids.push(rows[0].id);
  }
  return ids;
}
