/**
 * Disposable-database URLs for one real-schema suite (decision I-12, launch
 * L-24). Suites whose functions or assertions are database-wide (alerts, the
 * ops digest, the demo runner's queue, growth counts, the invoicing job) run
 * on their own copy of the migrated database, `caudals_<suite>`, which
 * scripts/evals/test-db.sh creates and lists in EVALS_TEST_ISOLATED_DATABASES.
 * Every other suite shares `caudals` with per-suite unique fixtures. Without
 * the copy (an older fixture database), the shared URLs are returned.
 */
export function testDatabaseUrls(suite: string) {
  const isolated = (process.env.EVALS_TEST_ISOLATED_DATABASES ?? "").split(",").includes(suite);
  const url = (value: string | undefined) => {
    if (!value || !isolated) return value;
    const next = new URL(value);
    next.pathname = `/caudals_${suite}`;
    return next.toString();
  };
  return {
    ownerUrl: url(process.env.EVALS_TEST_OWNER_URL),
    runtimeUrl: url(process.env.EVALS_TEST_RUNTIME_DATABASE_URL),
    schedulerUrl: url(process.env.EVALS_TEST_SCHEDULER_URL),
    adminUrl: url(process.env.EVALS_TEST_ADMIN_URL),
    documentsUrl: url(process.env.EVALS_TEST_DOCUMENTS_DATABASE_URL),
  };
}
