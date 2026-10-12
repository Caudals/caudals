import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SampleReportPage } from "@/components/sample-report/sample-report-page";
import { exampleView } from "@/lib/evals/example";
import { exampleEvaluationEnabled, sampleReportIndexed } from "@/lib/evals/example/flags";
import { sampleReportCopy } from "@/lib/evals/example/page-copy";
import { SAMPLE_REPORT_PATH } from "@/lib/evals/example/public";
import { resolveLocale } from "@/lib/i18n/server";
import { buildPublicMetadata } from "@/lib/seo";

type Props = { params: Promise<{ locale: string }> };

// The flags are read on every request (launch L-33): EXAMPLE_EVALUATION_ENABLED
// publishes the page, SAMPLE_REPORT_INDEXED lets search engines index it once
// the founder has read the content.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const copy = sampleReportCopy(locale);
  return buildPublicMetadata({
    title: copy.metaTitle,
    description: copy.metaDescription,
    pathname: SAMPLE_REPORT_PATH,
    locale,
    noIndex: !sampleReportIndexed(),
  });
}

/** The example evaluation as a public sample report (`/es/informe-de-ejemplo`). */
export default async function SampleReportRoute({ params }: Props) {
  const locale = resolveLocale((await params).locale);
  if (!exampleEvaluationEnabled()) notFound();
  return <SampleReportPage locale={locale} view={exampleView(locale)} />;
}
