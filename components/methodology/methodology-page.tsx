import { Header } from "@/components/ui/header";
import { MarketingFooter } from "@/components/marketing/footer";
import { VerdictMark } from "@/components/demo/verdict";
import type { Locale } from "@/lib/i18n/config";
import { splitMarked } from "@/lib/marked-text";
import { formatMethodologyDate, METHODOLOGY_UPDATED, methodologyCopy, splitStrong, type MethodologyLabels, type MethodologySection } from "@/lib/methodology/content";
import { MethodologyCta } from "./methodology-cta";

const prose = "max-w-[42rem] text-[17px] leading-[1.7] text-[#3b3a36] text-pretty";

function Paragraphs({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return items.map((text, index) => (
    <p key={index} className={prose}>
      {text}
    </p>
  ));
}

function Items({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="max-w-[42rem] list-disc space-y-3 pl-5 text-[17px] leading-[1.7] text-[#3b3a36] marker:text-[#b5b3ab]">
      {items.map((item, index) => {
        const { strong, rest } = splitStrong(item);
        return (
          <li key={index} className="pl-1 text-pretty">
            {strong ? <strong className="font-medium text-[#141413]">{strong}</strong> : null}
            {strong ? " " : null}
            {rest}
          </li>
        );
      })}
    </ul>
  );
}

/** Outcome labels: ink marks beside the word, a hairline table on wide screens and blocks on a phone. */
function Labels({ labels }: { labels: MethodologyLabels }) {
  const [label, scored, meaning] = labels.columns;
  const mark = (verdict: MethodologyLabels["rows"][number]["verdict"]) => <VerdictMark verdict={verdict} className="h-[18px] w-[18px] shrink-0 text-[#141413]" />;
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse text-left text-[15px] leading-relaxed">
          <thead>
            <tr className="border-b border-[#dcdad3]">
              {[label, scored, meaning].map((column) => (
                <th key={column} scope="col" className="py-3 pr-5 align-bottom text-sm font-medium text-[#6b6a63]">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.rows.map((row) => (
              <tr key={row.label} className="border-b border-[#e9e7e1] align-top">
                <th scope="row" className="py-4 pr-5 font-medium text-[#141413]">
                  <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
                    {mark(row.verdict)}
                    {row.label}
                  </span>
                </th>
                <td className="py-4 pr-5 whitespace-nowrap text-[#3b3a36]">{row.scored ? labels.yes : labels.no}</td>
                <td className="py-4 text-[#3b3a36]">{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-[#e9e7e1] border-y border-[#e9e7e1] md:hidden">
        {labels.rows.map((row) => (
          <li key={row.label} className="py-4">
            <p className="inline-flex items-center gap-2.5 text-base font-medium text-[#141413]">
              {mark(row.verdict)}
              {row.label}
            </p>
            <p className="mt-1 text-sm text-[#6b6a63]">
              {scored}: {row.scored ? labels.yes : labels.no}
            </p>
            <p className="mt-2 text-[15px] leading-relaxed text-[#3b3a36]">{row.meaning}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

/** A small numeric table (sample sizes): it fits a phone, so it stays a table, with tabular figures. */
function NumberTable({ table }: { table: NonNullable<MethodologySection["table"]> }) {
  return (
    <div className="max-w-[42rem] overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] tabular-nums">
        <thead>
          <tr className="border-b border-[#dcdad3]">
            {table.columns.map((column, index) => (
              <th key={column} scope="col" className={`py-3 pr-4 align-bottom text-sm font-medium text-[#6b6a63] ${index ? "text-right" : ""}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row[0]} className="border-b border-[#e9e7e1]">
              {row.map((value, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="py-3 pr-4 font-medium text-[#141413]">
                    {value}
                  </th>
                ) : (
                  <td key={index} className="py-3 pr-4 text-right text-[#3b3a36] whitespace-nowrap">
                    {value}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ section, number }: { section: MethodologySection; number: number }) {
  const headingId = `${section.id}-title`;
  return (
    <section id={section.id} aria-labelledby={headingId} className="scroll-mt-28 space-y-5">
      <h2 id={headingId} className="flex gap-3 text-xl font-medium tracking-tight text-[#141413] text-balance">
        <span className="text-[#6b6a63] tabular-nums">{number}.</span>
        <span>{section.title}</span>
      </h2>
      <Paragraphs items={section.body} />
      <Items items={section.items} />
      {section.labels ? <Labels labels={section.labels} /> : null}
      {section.table ? <NumberTable table={section.table} /> : null}
      <Paragraphs items={section.after} />
    </section>
  );
}

/**
 * The public methodology (launch L-20, P-40) in the Paper language: a reading
 * page like the legal documents, with numbered, anchored sections, the outcome
 * labels with their ink marks and a closing call to the free test.
 * Server-rendered; the copy comes from content/methodology.
 */
export function MethodologyPage({ locale }: { locale: Locale }) {
  const copy = methodologyCopy(locale);
  const { before, marked, after } = splitMarked(copy.title);
  return (
    <div className="min-h-screen bg-background font-mk-sans text-[#141413] selection:bg-black selection:text-white [--bg:#fafaf8]">
      <Header />
      <main id="main" className="mx-auto w-full max-w-[1200px] px-[clamp(16px,4vw,40px)] pb-24 pt-12 lg:pt-20">
        <article className="mx-auto min-w-0 max-w-[46rem]">
          <header className="border-b border-[#e9e7e1] pb-10">
            <p className="text-sm font-medium text-[#6b6a63]">{copy.kicker}</p>
            <h1 className="mt-3 text-[2.5rem] font-normal leading-[1.08] tracking-[-0.02em] text-balance sm:text-5xl">
              {before}
              {marked ? <em className="font-mk-serif italic">{marked}</em> : null}
              {after}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[#3b3a36] text-pretty">{copy.standfirst}</p>
            <p className="mt-6 text-sm text-[#6b6a63]">
              <time dateTime={METHODOLOGY_UPDATED}>{copy.updated.replace("{date}", formatMethodologyDate(locale))}</time>
            </p>
          </header>

          <nav aria-label={copy.contents} className="border-b border-[#e9e7e1] py-8">
            <p className="mb-4 text-sm font-medium text-[#6b6a63]">{copy.contents}</p>
            <ol className="grid gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
              {copy.sections.map((section, index) => (
                <li key={section.id} className="flex gap-2">
                  <span className="text-[#6b6a63] tabular-nums">{index + 1}.</span>
                  <a href={`#${section.id}`} className="text-[#3b3a36] transition-colors hover:text-[#141413]">
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-12 space-y-14">
            {copy.sections.map((section, index) => (
              <Section key={section.id} section={section} number={index + 1} />
            ))}
          </div>

          <section aria-labelledby="methodology-cta" className="mt-16 rounded-[14px] border border-[#dcdad3] bg-white p-6 sm:p-8">
            <h2 id="methodology-cta" className="text-2xl font-normal tracking-[-0.01em] text-balance">
              {copy.ctaTitle}
            </h2>
            <p className="mt-3 max-w-[38rem] text-base leading-relaxed text-[#3b3a36] text-pretty">{copy.ctaBody}</p>
            <div className="mt-6">
              <MethodologyCta demo={copy.ctaDemo} contact={copy.ctaContact} call={copy.ctaCall} />
            </div>
          </section>
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}
