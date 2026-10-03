# Foundation reference register

Reviewed 2026-09-29 against code and lockfiles; original adoption was checked
on 2026-09-17. External documentation
is API evidence, not a claim about our runtime.

- [pg-boss official source](https://github.com/timgit/pg-boss), MIT. Pinned
  `12.33.1` in the current lockfile, requiring Node >=22.12.0. App and evals
  Dockerfiles use Node24.21.0; observed PostgreSQL is16.13. Runtime dependencies
  include pg, cron-parser, rrule-temporal and serialize-error. The original
  adoption used10.3.3; dated test evidence remains historical. Durable external
  effects still require attempts/reservations.
- [PostgreSQL16 RLS](https://www.postgresql.org/docs/16/ddl-rowsecurity.html):
  FORCE policies and non-owner NOBYPASSRLS runtime; test pooled rollback and
  composite tenant references against real PostgreSQL.
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility):
  probe capabilities per model; inventory alone is insufficient.
- Existing Zod4, pg8, Better Auth1.6, AWS SDK S3: reuse installed/locked versions;
  do not add a second auth or storage client. Better Auth password hashing is
  imported from its public `better-auth/crypto` export.
- UI inspiration and delegated design evidence: `design/`.

`npm audit --json` was executed during adoption. See WP-03 for package-specific
result and final verification; pre-existing dependency findings are not silently
fixed through a major dependency update in this feature.
