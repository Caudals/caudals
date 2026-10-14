/**
 * Runtime flags for opt-in public results and the anonymous sector index
 * (launch L-31), read on the server on every request and passed to client
 * components as props. Never NEXT_PUBLIC_*: the image build cannot change them.
 *
 * - `PUBLIC_RESULTS_ENABLED`: the public pages (`/{locale}/results/<slug>`,
 *   `/{locale}/sector-index/<quarter>`), the owner's consent dialog on a report
 *   and its API. Off (the default): the pages and the API answer 404 and no
 *   control is shown. Stays off until the founder publishes by hand.
 * - `PUBLIC_RESULTS_INDEXED`: the founder's decision to let search engines
 *   index the pages. Until it is `true` every page is `noindex`.
 */
export function publicResultsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PUBLIC_RESULTS_ENABLED === "true";
}

export function publicResultsIndexed(env: Record<string, string | undefined> = process.env): boolean {
  return publicResultsEnabled(env) && env.PUBLIC_RESULTS_INDEXED === "true";
}
