-- Operator-reviewed recipe submission changes a candidate's provenance
-- before the isolated browser worker validates it. The app runtime must be
-- able to update that one column; browser execution never changes it.
GRANT UPDATE(source) ON evals.website_recipe_candidate TO evals_runtime;
