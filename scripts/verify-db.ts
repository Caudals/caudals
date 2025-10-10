import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!url || !anon || !service) {
    throw new Error("Missing Supabase env vars in .env.local");
  }

  const admin = createClient(url, service);
  const rand = Math.random().toString(36).slice(2, 10);
  const requesterEmail = `req_${rand}@example.com`;
  const contributorEmail = `con_${rand}@example.com`;
  const password = `Passw0rd!${rand}`;

  console.log("Creating test users...");
  const { data: reqUserRes, error: reqUserErr } = await admin.auth.admin.createUser({
    email: requesterEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Requester Test", role: "requester" },
  });
  if (reqUserErr) throw reqUserErr;

  const { data: conUserRes, error: conUserErr } = await admin.auth.admin.createUser({
    email: contributorEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Contributor Test", role: "contributor" },
  });
  if (conUserErr) throw conUserErr;

  const requesterClient = createClient(url, anon);
  const contributorClient = createClient(url, anon);

  console.log("Signing in as requester...");
  const { error: reqSignErr } = await requesterClient.auth.signInWithPassword({
    email: requesterEmail,
    password,
  });
  if (reqSignErr) throw reqSignErr;

  console.log("Signing in as contributor...");
  const { error: conSignErr } = await contributorClient.auth.signInWithPassword({
    email: contributorEmail,
    password,
  });
  if (conSignErr) throw conSignErr;

  const reqUser = (await requesterClient.auth.getUser()).data.user!;
  const conUser = (await contributorClient.auth.getUser()).data.user!;

  console.log("Creating dataset request as requester...");
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 30);
  const { data: drIns, error: drErr } = await requesterClient
    .from("dataset_requests")
    .insert({
      created_by: reqUser.id,
      title: `Verification Dataset ${rand}`,
      description: "Verification flow dataset",
      category: "computer-vision",
      data_type: "image",
      samples_needed: 3,
      reward_amount: 1.5,
      deadline: deadline.toISOString().slice(0, 10),
      quality_criteria: ["1080p min"],
      requirements: ["smartphone"],
      featured: false,
    })
    .select("id, created_by, samples_collected")
    .single();
  if (drErr) throw drErr;

  console.log("Creating submission as contributor...");
  const { data: subIns, error: subErr } = await contributorClient
    .from("submissions")
    .insert({
      dataset_request_id: drIns.id,
      contributor_id: conUser.id,
      file_urls: ["https://example.com/file1.jpg"],
      metadata: { note: "test" },
    })
    .select("id, status")
    .single();
  if (subErr) throw subErr;

  console.log("Approving submission as dataset owner (requester)...");
  const { data: subUpd, error: subUpdErr } = await requesterClient
    .from("submissions")
    .update({ status: "approved" })
    .eq("id", subIns.id)
    .select("id, status")
    .single();
  if (subUpdErr) throw subUpdErr;
  if (subUpd.status !== "approved") throw new Error("Status not approved");

  console.log("Checking samples_collected increment...");
  const { data: drAfter, error: drAfterErr } = await requesterClient
    .from("dataset_requests")
    .select("samples_collected")
    .eq("id", drIns.id)
    .single();
  if (drAfterErr) throw drAfterErr;
  if ((drAfter?.samples_collected ?? 0) < 1) throw new Error("samples_collected not incremented");

  console.log("Verification succeeded.");

  // Optional cleanup (comment out if you want to keep test data)
  await admin.from("submissions").delete().eq("id", subIns.id);
  await admin.from("dataset_requests").delete().eq("id", drIns.id);
  await admin.auth.admin.deleteUser(reqUser.id);
  await admin.auth.admin.deleteUser(conUser.id);
}

main().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});

