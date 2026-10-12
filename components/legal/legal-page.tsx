import Link from "next/link";
import { Download } from "lucide-react";
import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import type { Locale } from "@/lib/i18n/config";
import { localizePathname } from "@/lib/i18n/routing";
import { getScopedTranslator } from "@/lib/i18n/server";
import type { LegalDocument, LegalSection, LegalTable } from "@/lib/legal/documents";
import {
  dpaTemplateFileName,
  LEGAL_DOCUMENT_IDS,
  LEGAL_DOCUMENT_PATHS,
  legalDocumentVersion,
  type LegalDocumentId,
} from "@/lib/legal/versions";

type LegalPageProps = {
  id: LegalDocumentId;
  /** The document as published (`resolveLegalDocument`). */
  document: LegalDocument;
  locale: Locale;
};

/** Long documents get a contents list under the header. */
const CONTENTS_THRESHOLD = 6;

const DATE_LOCALES: Record<Locale, string> = { en: "en-US", es: "es-ES" };

function formatVersionDate(version: string, locale: Locale) {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${version}T00:00:00Z`));
}

const LINKABLE = /([\w.+-]+@caudals\.com|https:\/\/[^\s),]+)/g;
const linkClass =
  "font-medium text-[#141413] underline decoration-[#dcdad3] underline-offset-4 transition-colors hover:decoration-[#141413]";

/** Plain text with its email addresses and `https://` URLs linked. */
function Prose({ text }: { text: string }) {
  return text.split(LINKABLE).map((part, index) => {
    if (index % 2 === 0) return part;
    const url = part.replace(/\.$/, "");
    const rest = part.slice(url.length);
    const href = url.includes("@") ? `mailto:${url}` : url;
    return (
      <span key={index}>
        <a
          href={href}
          className={linkClass}
          {...(href.startsWith("http") ? { rel: "noopener noreferrer", target: "_blank" } : {})}
        >
          {url}
        </a>
        {rest}
      </span>
    );
  });
}

function Paragraphs({ items }: { items?: readonly string[] }) {
  if (!items?.length) return null;
  return items.map((text, index) => (
    <p key={index} className="max-w-[42rem] text-[17px] leading-[1.7] text-[#3b3a36] text-pretty">
      <Prose text={text} />
    </p>
  ));
}

/** A hairline table on wide screens; one block per row on a phone. */
function SectionTable({ table }: { table: LegalTable }) {
  const [first, ...rest] = table.columns;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-left text-sm leading-relaxed">
          <thead>
            <tr className="border-b border-[#dcdad3]">
              {table.columns.map((column) => (
                <th key={column} scope="col" className="py-3 pr-5 align-bottom font-medium text-[#6b6a63]">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row[0]} className="border-b border-[#e9e7e1] align-top">
                {row.map((value, index) =>
                  index === 0 ? (
                    <th key={index} scope="row" className="py-4 pr-5 font-medium text-[#141413]">
                      {value}
                    </th>
                  ) : (
                    <td key={index} className="py-4 pr-5 text-[#3b3a36]">
                      {value}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-[#e9e7e1] border-y border-[#e9e7e1] md:hidden">
        {table.rows.map((row) => (
          <li key={row[0]} className="py-5">
            <p className="text-base font-medium text-[#141413]">
              <span className="sr-only">{first}: </span>
              {row[0]}
            </p>
            <dl className="mt-3 space-y-2 text-sm leading-relaxed">
              {rest.map((column, index) => (
                <div key={column}>
                  <dt className="font-medium text-[#6b6a63]">{column}</dt>
                  <dd className="text-[#3b3a36]">{row[index + 1]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

function Section({
  section,
  number,
  locale,
}: {
  section: LegalSection;
  number: number;
  locale: Locale;
}) {
  const t = getScopedTranslator(locale, "legal");
  const headingId = `${section.id}-title`;
  return (
    <section id={section.id} aria-labelledby={headingId} className="scroll-mt-28 space-y-5">
      <h2 id={headingId} className="flex gap-3 text-xl font-medium tracking-tight text-[#141413] text-balance">
        <span className="text-[#6b6a63] tabular-nums">{number}.</span>
        <span>{section.title}</span>
      </h2>
      <Paragraphs items={section.body} />
      {section.items?.length ? (
        <ul className="max-w-[42rem] list-disc space-y-3 pl-5 text-[17px] leading-[1.7] text-[#3b3a36] marker:text-[#b5b3ab]">
          {section.items.map((item, index) => (
            <li key={index} className="pl-1 text-pretty">
              <Prose text={item} />
            </li>
          ))}
        </ul>
      ) : null}
      {section.table ? <SectionTable table={section.table} /> : null}
      <Paragraphs items={section.after} />
      {section.download ? (
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
          {(["en", "es"] as const).map((language) => (
            <a
              key={language}
              href={`/legal/${dpaTemplateFileName(language)}`}
              download
              hrefLang={language}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#dcdad3] bg-white px-5 py-2.5 text-sm font-medium text-[#141413] transition-colors hover:border-[#141413]"
            >
              <Download className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              {t(language === "en" ? "downloadEn" : "downloadEs")}
            </a>
          ))}
        </div>
      ) : null}
      {section.links?.length ? (
        <p className="text-sm text-[#6b6a63]">
          {t("related")}:{" "}
          {section.links.map((link, index) => (
            <span key={link.href}>
              {index > 0 ? " · " : null}
              <Link href={localizePathname(link.href, locale)} className={linkClass}>
                {link.label}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

function DocumentList({ current, locale }: { current: LegalDocumentId; locale: Locale }) {
  const t = getScopedTranslator(locale, "legal");
  const tFooter = getScopedTranslator(locale, "footer");
  return (
    <nav aria-label={t("documents")}>
      <p className="mb-4 text-sm font-medium text-[#6b6a63]">{t("documents")}</p>
      <ul className="space-y-2.5 text-sm">
        {LEGAL_DOCUMENT_IDS.map((id) => (
          <li key={id}>
            <Link
              href={localizePathname(LEGAL_DOCUMENT_PATHS[id], locale)}
              aria-current={id === current ? "page" : undefined}
              className={
                id === current
                  ? "font-medium text-[#141413]"
                  : "text-[#3b3a36] transition-colors hover:text-[#141413]"
              }
            >
              {tFooter(`legalLinks.${id}.label`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * The Paper layout shared by every legal page: a list of the legal documents
 * beside a single readable column (about 70 characters a line), the version
 * date under the title, numbered sections with anchors, and a contents list on
 * the long documents. Server-rendered; the copy comes from `content/legal`.
 */
export function LegalPage({ id, document, locale }: LegalPageProps) {
  const t = getScopedTranslator(locale, "legal");
  const version = legalDocumentVersion(id);
  const { title, description, sections } = document;

  return (
    <div className="min-h-screen bg-background font-mk-sans text-[#141413] selection:bg-black selection:text-white">
      <Header />
      <main className="mx-auto w-full max-w-[1200px] px-[clamp(16px,4vw,40px)] pb-24 pt-12 lg:pt-20">
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <DocumentList current={id} locale={locale} />
            </div>
          </aside>

          <article className="min-w-0">
            <header className="border-b border-[#e9e7e1] pb-10">
              <p className="text-sm font-medium text-[#6b6a63]">{t("kicker")}</p>
              <h1 className="mt-3 max-w-[42rem] text-[2.5rem] font-normal leading-[1.08] tracking-[-0.02em] text-balance sm:text-5xl">
                {title}
              </h1>
              <p className="mt-5 max-w-[42rem] text-lg leading-relaxed text-[#3b3a36] text-pretty">
                {description}
              </p>
              <p className="mt-6 text-sm text-[#6b6a63]">
                <time dateTime={version}>
                  {t("lastUpdated", { date: formatVersionDate(version, locale) })}
                </time>
                <span aria-hidden="true"> · </span>
                {t("version", { version })}
              </p>
            </header>

            {sections.length >= CONTENTS_THRESHOLD ? (
              <nav aria-label={t("contents")} className="border-b border-[#e9e7e1] py-8">
                <p className="mb-4 text-sm font-medium text-[#6b6a63]">{t("contents")}</p>
                <ol className="grid gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
                  {sections.map((section, index) => (
                    <li key={section.id} className="flex gap-2">
                      <span className="text-[#6b6a63] tabular-nums">{index + 1}.</span>
                      <a href={`#${section.id}`} className="text-[#3b3a36] transition-colors hover:text-[#141413]">
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}

            <div className="mt-12 space-y-14">
              {sections.map((section, index) => (
                <Section key={section.id} section={section} number={index + 1} locale={locale} />
              ))}
            </div>

            <div className="mt-16 border-t border-[#e9e7e1] pt-10 lg:hidden">
              <DocumentList current={id} locale={locale} />
            </div>
          </article>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
