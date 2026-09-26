#!/usr/bin/env node
/**
 * Submits every public URL in the page sitemap to IndexNow, which forwards it
 * to Bing (and so to ChatGPT search and Copilot), Yandex, Seznam and Naver.
 * Run it after a deploy that adds or changes public pages:
 *
 *   npm run seo:indexnow
 *
 * The key is public by design: IndexNow verifies ownership by fetching
 * https://caudals.com/<key>.txt, which is served from `public/`. To rotate it,
 * replace that file and INDEXNOW_KEY below together.
 */

const INDEXNOW_KEY = "9d7cd7259f834a48b0d20593eaf31b32"; // public by design, see above. gitleaks:allow
const origin = (process.env.SITE_ORIGIN ?? "https://caudals.com").replace(/\/+$/, "");
const host = new URL(origin).host;

async function sitemapUrls() {
  const response = await fetch(`${origin}/page-sitemap.xml`);
  if (!response.ok) throw new Error(`Sitemap request failed: ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

const urlList = await sitemapUrls();
const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${origin}/${INDEXNOW_KEY}.txt`,
    urlList,
  }),
});

// 200 and 202 both mean accepted; 202 means the key is still being verified.
console.log(`IndexNow: ${response.status} ${response.statusText} for ${urlList.length} URLs`);
if (!response.ok) process.exitCode = 1;
