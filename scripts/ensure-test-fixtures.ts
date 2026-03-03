import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  FIXTURE_DATASET_ID,
  FIXTURE_SUBMISSION_ID,
  FIXTURE_USERS,
  seedTestFixtures,
} from "@/scripts/seed-test-fixtures";

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

const MAX_AGE_HOURS = Number(process.env.TEST_FIXTURE_MAX_AGE_HOURS ?? "168");
const AUTO_RESEED = process.env.TEST_FIXTURE_AUTO_RESEED !== "false";

function isFreshTimestamp(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const ageHours = (Date.now() - date.getTime()) / (1000 * 60 * 60);
  return ageHours <= MAX_AGE_HOURS;
}

async function getFixtureAuthUsers() {
  const usersResponse = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersResponse.error) {
    throw new Error(`Failed to list auth users: ${usersResponse.error.message}`);
  }

  return usersResponse.data.users;
}

async function verifyFixtures() {
  const users = await getFixtureAuthUsers();
  const fixtureUserMap = new Map(
    FIXTURE_USERS.map((fixtureUser) => [fixtureUser.email, fixtureUser])
  );
  const authUsers = new Map(
    users
      .filter((user) => user.email && fixtureUserMap.has(user.email))
      .map((user) => [user.email as string, user])
  );

  for (const fixtureUser of FIXTURE_USERS) {
    if (!authUsers.has(fixtureUser.email)) {
      return {
        ok: false,
        reason: `Missing auth user for ${fixtureUser.email}`,
      };
    }
  }

  const requesterId = authUsers.get("fixture.requester@caudals.local")?.id;
  const contributorId = authUsers.get("fixture.contributor@caudals.local")?.id;
  const adminId = authUsers.get("fixture.admin@caudals.local")?.id;

  if (!requesterId || !contributorId || !adminId) {
    return {
      ok: false,
      reason: "Fixture auth users resolved without all expected IDs",
    };
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,role")
    .in("id", [requesterId, contributorId, adminId]);

  if (profilesError) {
    throw new Error(`Failed to load fixture profiles: ${profilesError.message}`);
  }

  const profileRole = new Map((profiles ?? []).map((profile) => [profile.id, profile.role]));
  if (
    profileRole.get(requesterId) !== "requester" ||
    profileRole.get(contributorId) !== "contributor" ||
    profileRole.get(adminId) !== "admin"
  ) {
    return {
      ok: false,
      reason: "Fixture profiles are missing or have incorrect role assignments",
    };
  }

  const { data: dataset, error: datasetError } = await supabase
    .from("dataset_requests")
    .select("id,created_by,updated_at")
    .eq("id", FIXTURE_DATASET_ID)
    .maybeSingle();

  if (datasetError) {
    throw new Error(`Failed to load fixture dataset: ${datasetError.message}`);
  }

  if (!dataset || dataset.created_by !== requesterId) {
    return {
      ok: false,
      reason: "Fixture dataset is missing or linked to wrong requester",
    };
  }

  if (!isFreshTimestamp(dataset.updated_at)) {
    return {
      ok: false,
      reason: `Fixture dataset is stale (older than ${MAX_AGE_HOURS}h)`,
    };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("submissions")
    .select("id,dataset_request_id,contributor_id,updated_at")
    .eq("id", FIXTURE_SUBMISSION_ID)
    .maybeSingle();

  if (submissionError) {
    throw new Error(`Failed to load fixture submission: ${submissionError.message}`);
  }

  if (
    !submission ||
    submission.dataset_request_id !== FIXTURE_DATASET_ID ||
    submission.contributor_id !== contributorId
  ) {
    return {
      ok: false,
      reason: "Fixture submission is missing or linked to wrong dataset/contributor",
    };
  }

  if (!isFreshTimestamp(submission.updated_at)) {
    return {
      ok: false,
      reason: `Fixture submission is stale (older than ${MAX_AGE_HOURS}h)`,
    };
  }

  return { ok: true, reason: "Fixture users/data are present and fresh" };
}

async function ensureFixtures() {
  const firstCheck = await verifyFixtures();
  if (firstCheck.ok) {
    console.log(`Fixture verification passed: ${firstCheck.reason}`);
    return;
  }

  if (!AUTO_RESEED) {
    throw new Error(`Fixture verification failed: ${firstCheck.reason}`);
  }

  console.warn(`Fixture verification failed, reseeding: ${firstCheck.reason}`);
  await seedTestFixtures();

  const secondCheck = await verifyFixtures();
  if (!secondCheck.ok) {
    throw new Error(`Fixture verification failed after reseed: ${secondCheck.reason}`);
  }

  console.log(`Fixture verification passed after reseed: ${secondCheck.reason}`);
}

ensureFixtures().catch((error) => {
  console.error("Fixture freshness check failed:", error);
  process.exit(1);
});
