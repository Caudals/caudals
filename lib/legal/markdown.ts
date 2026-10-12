import type { Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { buildMarketingUrl } from "@/lib/seo";
import { resolveLegalDocument, type LegalTable } from "./documents";
import type { LegalEntity } from "./entity";
import { dpaTemplateFileName, legalDocumentVersion, type LegalDocumentId } from "./versions";

/** Pipes and line breaks would break a Markdown table cell. */
const cell = (value: string) => value.replaceAll("|", "\\|").replace(/\s+/g, " ");

function markdownTable({ columns, rows }: LegalTable) {
  return [
    `| ${columns.map(cell).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
  ].join("\n");
}

/**
 * A legal document as Markdown, for agents that ask for `text/markdown`. Same
 * content and company data as the HTML page, plus the version line.
 */
export function renderLegalMarkdown(
  id: LegalDocumentId,
  locale: Locale,
  entity: LegalEntity | null,
) {
  const document = resolveLegalDocument(id, locale, entity);
  const version = legalDocumentVersion(id);
  const sections = document.sections.map((section, index) => {
    const parts = [`## ${index + 1}. ${section.title}`];
    if (section.body?.length) parts.push(...section.body);
    if (section.items?.length) parts.push(section.items.map((item) => `- ${item}`).join("\n"));
    if (section.table) parts.push(markdownTable(section.table));
    if (section.after?.length) parts.push(...section.after);
    if (section.download) {
      parts.push(
        (["en", "es"] as const)
          .map((language) => `- ${buildMarketingUrl(`/legal/${dpaTemplateFileName(language)}`)}`)
          .join("\n"),
      );
    }
    if (section.links?.length) {
      parts.push(
        section.links
          .map((link) => `[${link.label}](${buildMarketingUrl(localizePathname(link.href, locale))})`)
          .join(" · "),
      );
    }
    return parts.join("\n\n");
  });

  return {
    title: document.title,
    description: `${document.description} (${version})`,
    body: sections.join("\n\n"),
  };
}
