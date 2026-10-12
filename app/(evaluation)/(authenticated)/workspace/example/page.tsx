import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { ExampleEvaluation } from "@/components/evals/example-evaluation";
import { exampleView } from "@/lib/evals/example";
import { exampleEvaluationEnabled } from "@/lib/evals/example/flags";
import { samplePdfHref } from "@/lib/evals/example/public";
import { resolveInterfaceLocale } from "@/lib/evals/interface-locale";
import { LOCALE_COOKIE } from "@/lib/evals/messages/en";

/**
 * The read-only example evaluation (launch L-33). It is rendered from the
 * versioned fixture in the person's interface language; no API route and no
 * database row is involved, so it cannot be changed and is never counted.
 */
export default async function ExampleEvaluationPage() {
  await requirePageIdentity("/workspace/example");
  if (!exampleEvaluationEnabled()) notFound();
  const locale = resolveInterfaceLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return <ExampleEvaluation view={exampleView(locale)} pdfHref={samplePdfHref(locale)} />;
}
