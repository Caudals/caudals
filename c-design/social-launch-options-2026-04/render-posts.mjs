import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.join(__dirname, "index.html");
const exportDir = path.join(__dirname, "exports");

await mkdir(exportDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 1200 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });

const posts = await page.locator(".post").evaluateAll((nodes) =>
  nodes.map((node) => ({
    id: node.getAttribute("id"),
    exportId: node.getAttribute("data-export-id"),
  })),
);

for (const post of posts) {
  if (!post.id || !post.exportId) continue;

  await page.locator(`#${post.id}`).screenshot({
    path: path.join(exportDir, `${post.exportId}.png`),
  });
}

await browser.close();
