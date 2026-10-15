// Minimal Slack Web API client for the Caudals workspace scripts.
// Tokens come from the environment or from the private env file written at
// install time (default ~/.config/caudals/slack/caudals.env). Never log them.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_FILE =
  process.env.CAUDALS_SLACK_ENV ?? join(homedir(), ".config/caudals/slack/caudals.env");

function loadEnvFile() {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
  );
}

const fileEnv = loadEnvFile();
const tokenFor = (kind) => {
  const name = kind === "user" ? "CAUDALS_SLACK_USER_TOKEN" : "CAUDALS_SLACK_BOT_TOKEN";
  const value = process.env[name] ?? fileEnv[name];
  if (!value) throw new Error(`${name} is not set (env or ${ENV_FILE})`);
  return value;
};

export async function slack(method, params = {}, { as = "bot", allow = [] } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Form encoding works for every method; nested values are sent as JSON strings.
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
    }
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor(as)}` },
      body: form,
    });
    if (response.status === 429) {
      const wait = Number(response.headers.get("retry-after") ?? "2");
      await new Promise((resolve) => setTimeout(resolve, wait * 1000));
      continue;
    }
    const body = await response.json();
    if (!body.ok && !allow.includes(body.error)) {
      const detail = body.response_metadata?.messages?.join("; ") ?? "";
      throw new Error(`${method} failed: ${body.error}${detail ? ` (${detail})` : ""}`);
    }
    return body;
  }
  throw new Error(`${method} failed: rate limited`);
}

export async function paginate(method, params, key, options) {
  const items = [];
  let cursor;
  do {
    const page = await slack(method, { ...params, cursor, limit: 200 }, options);
    items.push(...(page[key] ?? []));
    cursor = page.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return items;
}
