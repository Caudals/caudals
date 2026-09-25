-- Judge and narrative jobs link immutable assessments, report revisions and
-- settled spend. Disable the routes and ship a reviewed forward repair instead.
DO $$ BEGIN
  RAISE EXCEPTION 'Refusing destructive rollback of rubric judge and narrative history';
END $$;
