import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { ExampleReadout } from "@/components/evals/readout/readout-present";
import { exampleView } from "@/lib/evals/example";
import { exampleEvaluationEnabled } from "@/lib/evals/example/flags";
import { resolveInterfaceLocale } from "@/lib/evals/interface-locale";
import { LOCALE_COOKIE } from "@/lib/evals/messages/en";
import { readoutMode } from "@/lib/evals/readout/flags";

/**
 * The example evaluation as the demo deck (launch L-35 with L-33): readout
 * mode on the versioned fixture, read-only. Notes and picks stay on the
 * presenter's device; nothing is stored or exported.
 */
export default async function ExamplePresentPage() {
  await requirePageIdentity("/workspace/example");
  const mode = readoutMode();
  if (!exampleEvaluationEnabled() || mode === "off") notFound();
  const locale = resolveInterfaceLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  return <ExampleReadout snapshot={exampleView(locale).report} mode={mode} />;
}
