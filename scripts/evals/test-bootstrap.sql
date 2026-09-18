-- Disposable fixture database only. No production identity/data is copied.
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE OR REPLACE FUNCTION app_private.assert_ulid_prefixed(value text,prefix text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT value ~ ('^'||prefix||'_[0-9A-HJKMNP-TV-Z]{26}$') $$;
