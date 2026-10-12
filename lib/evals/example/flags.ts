import "server-only";

/**
 * Runtime flags for the example evaluation (launch L-33), read on the server
 * on every request and passed to client components as props.
 *
 * - `EXAMPLE_EVALUATION_ENABLED`: the in-app example, the public sample report
 *   page and its PDF. Off: the routes answer 404 and no link is shown.
 * - `SAMPLE_REPORT_INDEXED`: the founder's go-ahead after reading the content.
 *   Until it is `true` the public page is `noindex` and stays out of the
 *   sitemap and llms.txt.
 */
export function exampleEvaluationEnabled(): boolean {
  return process.env.EXAMPLE_EVALUATION_ENABLED === "true";
}

export function sampleReportIndexed(): boolean {
  return exampleEvaluationEnabled() && process.env.SAMPLE_REPORT_INDEXED === "true";
}
