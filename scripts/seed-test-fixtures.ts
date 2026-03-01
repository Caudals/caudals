import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const FIXTURE_PASSWORD = process.env.TEST_FIXTURE_PASSWORD ?? "CaudalsFixture123!";
const FIXTURE_DATASET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FIXTURE_SUBMISSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type FixtureUser = {
  email: string;
  full_name: string;
  role: "requester" | "contributor" | "admin";
};

const FIXTURE_USERS: FixtureUser[] = [
  {
    email: "fixture.requester@caudals.local",
    full_name: "Fixture Requester",
    role: "requester",
  },
  {
    email: "fixture.contributor@caudals.local",
    full_name: "Fixture Contributor",
    role: "contributor",
  },
  {
    email: "fixture.admin@caudals.local",
    full_name: "Fixture Admin",
    role: "admin",
  },
];

async function ensureAuthUser(user: FixtureUser) {
  const usersResponse = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (usersResponse.error) {
    throw new Error(`Failed to list auth users: ${usersResponse.error.message}`);
  }

  const existing = usersResponse.data.users.find((row) => row.email === user.email);
  if (existing) {
    const updated = await supabase.auth.admin.updateUserById(existing.id, {
      password: FIXTURE_PASSWORD,
      email_confirm: true,
      user_metadata: {
        full_name: user.full_name,
      },
    });

    if (updated.error) {
      throw new Error(
        `Failed to update auth user ${user.email}: ${updated.error.message}`
      );
    }

    return existing.id;
  }

  const created = await supabase.auth.admin.createUser({
    email: user.email,
    password: FIXTURE_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: user.full_name,
    },
  });

  if (created.error || !created.data.user) {
    throw new Error(
      `Failed to create auth user ${user.email}: ${created.error?.message ?? "unknown error"}`
    );
  }

  return created.data.user.id;
}

async function run() {
  console.log("Seeding deterministic test fixtures...");

  const userIds = new Map<string, string>();

  for (const fixtureUser of FIXTURE_USERS) {
    const id = await ensureAuthUser(fixtureUser);
    userIds.set(fixtureUser.email, id);
  }

  const requesterId = userIds.get("fixture.requester@caudals.local");
  const contributorId = userIds.get("fixture.contributor@caudals.local");
  const adminId = userIds.get("fixture.admin@caudals.local");

  if (!requesterId || !contributorId || !adminId) {
    throw new Error("Fixture user IDs were not resolved correctly.");
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    FIXTURE_USERS.map((fixtureUser) => ({
      id: userIds.get(fixtureUser.email),
      full_name: fixtureUser.full_name,
      mail: fixtureUser.email,
      role: fixtureUser.role,
    })),
    { onConflict: "id" }
  );

  if (profileError) {
    throw new Error(`Failed to upsert profiles: ${profileError.message}`);
  }

  const { error: datasetError } = await supabase.from("dataset_requests").upsert(
    {
      id: FIXTURE_DATASET_ID,
      created_by: requesterId,
      title: "Fixture Dataset Lifecycle",
      description:
        "Deterministic dataset request used by CI/local smoke and integration tests.",
      category: "computer-vision",
      data_type: "image",
      status: "active",
      approval_status: "approved",
      samples_needed: 25,
      samples_collected: 4,
      reward_amount: 1.5,
      currency: "USD",
      deadline: "2026-12-31",
      quality_criteria: ["Clear sample", "No watermark"],
      requirements: ["JPG format"],
      total_budget: 37.5,
      paid_amount: 37.5,
      payment_status: "paid",
      featured: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (datasetError) {
    throw new Error(`Failed to upsert fixture dataset: ${datasetError.message}`);
  }

  const { error: submissionError } = await supabase.from("submissions").upsert(
    {
      id: FIXTURE_SUBMISSION_ID,
      dataset_request_id: FIXTURE_DATASET_ID,
      contributor_id: contributorId,
      file_urls: ["https://example.com/fixture/submission-1.json"],
      status: "approved",
      notes: "Fixture submission for lifecycle tests.",
      metadata: { seeded_by: "seed-test-fixtures.ts" },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (submissionError) {
    throw new Error(`Failed to upsert fixture submission: ${submissionError.message}`);
  }

  console.log("Fixture seed complete.");
  console.log(`Requester: ${requesterId}`);
  console.log(`Contributor: ${contributorId}`);
  console.log(`Admin: ${adminId}`);
  console.log(`Dataset ID: ${FIXTURE_DATASET_ID}`);
  console.log(`Submission ID: ${FIXTURE_SUBMISSION_ID}`);
}

run().catch((error) => {
  console.error("Fixture seed failed:", error);
  process.exit(1);
});
