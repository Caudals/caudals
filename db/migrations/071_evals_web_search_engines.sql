-- Web search engines for every model (docs/evals/grading-engine.md, "Web research").
--
-- Migration 070 let a role search the web only through OpenRouter's plugin.
-- With a search engine connected here (Tavily, Exa), the inference worker
-- runs a call's queries itself and hands the results to whichever model the
-- role uses, the private DGX included. Keys belong to the platform, like
-- provider keys: an envelope bound to (nil org, engine, 'web_search'), written
-- by the admin login and read only by the inference worker.
BEGIN;

CREATE TABLE evals.web_search_connection (
  engine text PRIMARY KEY CHECK (engine IN ('tavily','exa')),
  envelope jsonb NOT NULL,
  key_hint text CHECK (key_hint IS NULL OR length(key_hint) <= 12),
  -- Lower first; the next engine is used when the first fails.
  priority smallint NOT NULL DEFAULT 1 CHECK (priority BETWEEN 1 AND 9),
  enabled boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON evals.web_search_connection FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON evals.web_search_connection TO evals_execution_admin;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='evals_worker') THEN
    GRANT SELECT ON evals.web_search_connection TO evals_worker;
  END IF;
END $$;

COMMIT;
