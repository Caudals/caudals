import fs from "fs";
import path from "path";

const INPUT = path.join(process.cwd(), "translations-source.json");
const OUTPUT = path.join(process.cwd(), "translations-es.json");

async function translateText(text: string) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "es");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Translation request failed: ${response.status} ${response.statusText}`);
  }
  const data = (await response.json()) as any;
  return data?.[0]?.[0]?.[0] ?? text;
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    throw new Error("translations-source.json not found. Run extract script first.");
  }
  const source: string[] = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const existing: Record<string, string> = fs.existsSync(OUTPUT)
    ? JSON.parse(fs.readFileSync(OUTPUT, "utf8"))
    : {};

  for (const text of source) {
    if (existing[text]) continue;
    try {
      const translated = await translateText(text);
      existing[text] = translated;
      console.log(`Translated: ${text} -> ${translated}`);
      fs.writeFileSync(OUTPUT, JSON.stringify(existing, null, 2));
    } catch (error) {
      console.error(`Failed to translate '${text}':`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  console.log(`Saved ${Object.keys(existing).length} translations to ${OUTPUT}`);
}

main();
