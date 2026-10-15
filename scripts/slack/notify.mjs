#!/usr/bin/env node
// Posts a message to a Caudals Slack channel as the caudals bot. For agents,
// scripts and CI. Prints the message ts so follow-ups can go in its thread.
//
//   node scripts/slack/notify.mjs <channel-key|channel-id> "text" [--thread <ts>] [--as "Name"]
//   echo "text" | node scripts/slack/notify.mjs alerts -
//
// Channel keys come from infra/slack/channels.json: general, customers, build,
// growth, agents, alerts. Text is Slack mrkdwn.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { slack } from "./slack-api.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const [, value] = args.splice(index, 2);
  return value;
};
const thread = flag("--thread");
const username = flag("--as");
const [target, rawText] = args;
if (!target || rawText === undefined) {
  console.error('usage: notify.mjs <channel> "text" [--thread <ts>] [--as "Name"]');
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const { channels } = JSON.parse(readFileSync(join(root, "infra/slack/channels.json"), "utf8"));
const channel = channels[target] ?? target;
const text = rawText === "-" ? readFileSync(0, "utf8").trim() : rawText;

const result = await slack("chat.postMessage", {
  channel,
  text,
  thread_ts: thread,
  username,
  unfurl_links: false,
  unfurl_media: false,
});
console.log(result.ts);
