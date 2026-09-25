// Stage A suites create databases/roles and need an owner connection. When the
// shared fixture from scripts/evals/test-db.sh is used, EVALS_TEST_OWNER_URL is
// that owner and EVALS_TEST_DATABASE_URL is the non-owner runtime login; older
// setups passed the owner as EVALS_TEST_DATABASE_URL. Support both.
export const stageAOwnerUrl = process.env.EVALS_TEST_OWNER_URL ?? process.env.EVALS_TEST_DATABASE_URL;
if (process.env.EVALS_TEST_OWNER_URL && process.env.EVALS_TEST_DATABASE_URL && !process.env.EVALS_DATABASE_URL) {
  process.env.EVALS_DATABASE_URL = process.env.EVALS_TEST_DATABASE_URL;
}
