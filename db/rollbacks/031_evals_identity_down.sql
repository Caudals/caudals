-- Forward repair only once identities/invitations have been created.
-- Disable evaluation ingress and workers; restore prior compatible web image.
-- Preserve evals schema, audit records, memberships and token revocations.
-- Do not DROP SCHEMA: it would erase later evidence/cost records.
SELECT 'No destructive reversal; follow docs/evals/work-packages/WP-01.md' AS recovery;
