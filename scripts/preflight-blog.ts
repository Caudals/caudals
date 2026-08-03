import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { preflightBlogSource } from "../lib/blog/preflight";

async function main() {
  const root = path.join(process.cwd(), "content", "blog");
  const locales = ["en", "es"] as const;
  const slugsByLocale = new Map<string, Set<string>>();
  const failures: string[] = [];

  for (const locale of locales) {
    const directory = path.join(root, locale);
    const files = (await fs.readdir(directory)).filter((name) => name.endsWith(".mdx")).sort();
    const slugs = new Set(files.map((name) => name.slice(0, -4)));
    slugsByLocale.set(locale, slugs);
    for (const file of files) {
      const slug = file.slice(0, -4);
      const source = await fs.readFile(path.join(directory, file), "utf8");
      const result = preflightBlogSource(source, { slug, locale });
      for (const entry of result.issues) {
        const line = entry.line ? `:${entry.line}` : "";
        const message = `${entry.severity.toUpperCase()} ${locale}/${file}${line} [${entry.code}] ${entry.message}`;
        if (entry.severity === "error") failures.push(message);
        else process.stderr.write(`${message}\n`);
      }
    }
  }

  const canonical = slugsByLocale.get("en") ?? new Set<string>();
  for (const locale of locales) {
    const slugs = slugsByLocale.get(locale) ?? new Set<string>();
    for (const slug of canonical) if (!slugs.has(slug)) failures.push(`ERROR ${locale}/${slug}.mdx [locale.missing] Locale pair is missing.`);
    for (const slug of slugs) if (!canonical.has(slug)) failures.push(`ERROR ${locale}/${slug}.mdx [locale.orphan] No English pair exists.`);
  }

  for (const slug of canonical) {
    const paired = await Promise.all(locales.map(async (locale) => matter(await fs.readFile(path.join(root, locale, `${slug}.mdx`), "utf8")).data));
    if (paired[0]?.categoryKey !== paired[1]?.categoryKey) failures.push(`ERROR ${slug} [locale.category] categoryKey differs between locales.`);
  }

  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Blog preflight passed for ${canonical.size} paired articles (${canonical.size * locales.length} files).\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`Blog preflight crashed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
