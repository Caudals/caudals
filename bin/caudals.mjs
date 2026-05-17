#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = process.platform === "win32" ? "tsx.cmd" : "tsx";
const result = spawnSync(
  join(root, "node_modules", ".bin", tsx),
  [join(root, "scripts", "caudals.ts"), ...process.argv.slice(2)],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
