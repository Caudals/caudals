# Test Fixture Strategy

## Purpose

Provide deterministic baseline data for local and CI validation so tests can target stable role journeys and lifecycle states.

## Canonical Fixture Users

The fixture seeding script creates or reuses these accounts:

- `fixture.requester@caudals.local` (`requester`)
- `fixture.contributor@caudals.local` (`contributor`)
- `fixture.admin@caudals.local` (`admin`)

Default password:

- `CaudalsFixture123!`
- Override with `TEST_FIXTURE_PASSWORD`

## Canonical Fixture Records

- Dataset ID: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
- Submission ID: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`

Seeded state:

- dataset approved + funded (`payment_status=paid`)
- one approved contributor submission linked to the dataset

## Commands

Run fixture seed:

```bash
npm run seed:test-fixtures
```

Run authenticated Playwright smoke (fixture users):

```bash
PLAYWRIGHT_AUTH_E2E=true npx playwright test e2e/authenticated-role-smoke.spec.ts --project=chromium
```

Prerequisites in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## CI Usage Pattern

1. Run DB migrations.
2. Run `npm run seed:test-fixtures`.
3. Execute unit/integration tests.
4. Execute E2E smoke tests (using fixture credentials once authenticated smoke tests are enabled).
