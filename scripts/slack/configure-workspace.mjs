#!/usr/bin/env node
// Applies infra/slack/workspace.json to the Caudals Slack workspace.
// Idempotent: renames/creates channels, sets purpose and topic, adds the
// founders and the Caudals bot, and adds missing bookmarks. Channels that are
// not in the file are only reported unless --archive-extras is passed.
//
//   node scripts/slack/configure-workspace.mjs [--dry-run] [--archive-extras]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slack, paginate } from "./slack-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const config = JSON.parse(readFileSync(join(root, "infra/slack/workspace.json"), "utf8"));
const dryRun = process.argv.includes("--dry-run");
const archiveExtras = process.argv.includes("--archive-extras");
const log = (...args) => console.log(dryRun ? "[dry-run]" : "", ...args);

async function act(description, fn) {
  log(description);
  if (!dryRun) await fn();
}

const user = { as: "user" };
const bot = await slack("auth.test");
const me = await slack("auth.test", {}, user);
const humans = (await paginate("users.list", {}, "members"))
  .filter((m) => !m.deleted && !m.is_bot && m.id !== "USLACKBOT" && !m.is_restricted)
  .map((m) => m.id);
const channels = await paginate(
  "conversations.list",
  { types: "public_channel", exclude_archived: false },
  "channels",
  user
);

const matched = new Set();
const ids = {};
for (const desired of config.channels) {
  const names = [desired.name, ...desired.previous_names];
  let channel =
    channels.find((c) => c.name === desired.name && !matched.has(c.id)) ??
    channels.find(
      (c) => !matched.has(c.id) && names.some((n) => c.name === n || c.name_normalized === n)
    );

  if (!channel) {
    if (dryRun) {
      log(`create #${desired.name}`);
      continue;
    }
    channel = (await slack("conversations.create", { name: desired.name }, user)).channel;
    log(`created #${desired.name} (${channel.id})`);
  }
  matched.add(channel.id);
  ids[desired.key] = channel.id;

  if (channel.is_archived) {
    await act(`unarchive #${channel.name}`, () =>
      slack("conversations.unarchive", { channel: channel.id }, user)
    );
  }
  if (channel.name !== desired.name) {
    await act(`rename #${channel.name} → #${desired.name}`, () =>
      slack("conversations.rename", { channel: channel.id, name: desired.name }, user)
    );
  }
  if (channel.purpose?.value !== desired.purpose) {
    await act(`set purpose of #${desired.name}`, () =>
      slack("conversations.setPurpose", { channel: channel.id, purpose: desired.purpose }, user)
    );
  }
  if (channel.topic?.value !== desired.topic) {
    await act(`set topic of #${desired.name}`, () =>
      slack("conversations.setTopic", { channel: channel.id, topic: desired.topic }, user)
    );
  }

  if (dryRun) continue;
  await slack("conversations.join", { channel: channel.id });
  const members = await paginate("conversations.members", { channel: channel.id }, "members");
  const missing = humans.filter((id) => !members.includes(id) && id !== me.user_id);
  if (!members.includes(me.user_id)) missing.unshift(me.user_id);
  if (missing.length) {
    await act(`invite ${missing.join(",")} to #${desired.name}`, () =>
      slack(
        "conversations.invite",
        { channel: channel.id, users: missing.join(",") },
        { ...user, allow: ["already_in_channel", "cant_invite_self"] }
      )
    );
  }

  const existing = (await slack("bookmarks.list", { channel_id: channel.id })).bookmarks ?? [];
  // Remove only bookmarks this app added that are no longer in workspace.json;
  // bookmarks people add by hand are left alone.
  for (const stale of existing.filter(
    (b) =>
      b.last_updated_by_user_id === bot.user_id &&
      !desired.bookmarks.some((d) => d.link === b.link)
  )) {
    await act(`remove bookmark "${stale.title}" from #${desired.name}`, () =>
      slack("bookmarks.remove", { channel_id: channel.id, bookmark_id: stale.id })
    );
  }
  for (const bookmark of desired.bookmarks) {
    if (existing.some((b) => b.link === bookmark.link)) continue;
    await act(`bookmark "${bookmark.title}" in #${desired.name}`, () =>
      slack("bookmarks.add", {
        channel_id: channel.id,
        title: bookmark.title,
        type: "link",
        link: bookmark.link,
      })
    );
  }
}

for (const extra of channels.filter((c) => !matched.has(c.id) && !c.is_archived)) {
  if (archiveExtras) {
    await act(`archive #${extra.name}`, () =>
      slack("conversations.archive", { channel: extra.id }, user)
    );
  } else {
    log(`not in workspace.json (left as is): #${extra.name}`);
  }
}

if (!dryRun) {
  const out = join(root, "infra/slack/channels.json");
  writeFileSync(out, `${JSON.stringify({ team_id: me.team_id, bot_user_id: bot.user_id, channels: ids }, null, 2)}\n`);
  log(`wrote ${out}`);
}
