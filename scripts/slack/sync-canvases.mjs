#!/usr/bin/env node
// Publishes infra/slack/canvases/<channel-key>.md as that channel's canvas
// (the Free plan allows one canvas per channel). Creates it on first run and
// replaces its content afterwards. Needs infra/slack/channels.json.
//
//   node scripts/slack/sync-canvases.mjs [channel-key ...]
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { slack } from "./slack-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const dir = join(root, "infra/slack/canvases");
const { channels } = JSON.parse(readFileSync(join(root, "infra/slack/channels.json"), "utf8"));
const only = process.argv.slice(2);

for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
  const key = basename(file, ".md");
  if (only.length && !only.includes(key)) continue;
  const channel = channels[key];
  if (!channel) throw new Error(`No channel "${key}" in channels.json`);
  // The file's H1 becomes the canvas title, so it is not repeated in the body.
  const source = readFileSync(join(dir, file), "utf8");
  const title = source.match(/^# (.+)$/m)?.[1] ?? key;
  const markdown = source.replace(/^# .+\n+/m, "");
  const content = { type: "markdown", markdown };

  // Channel canvases live in the channel's tabs (older workspaces: properties.canvas).
  const info = await slack("conversations.info", { channel });
  const properties = info.channel.properties ?? {};
  const canvasId =
    properties.tabs?.find((tab) => tab.type === "canvas")?.data?.file_id ??
    properties.canvas?.file_id;
  if (canvasId) {
    await slack("canvases.edit", {
      canvas_id: canvasId,
      changes: [{ operation: "replace", document_content: content }],
    });
    console.log(`updated #${info.channel.name} canvas (${canvasId})`);
  } else {
    const created = await slack("conversations.canvases.create", {
      channel_id: channel,
      title,
      document_content: content,
    });
    console.log(`created #${info.channel.name} canvas (${created.canvas_id})`);
  }
}
