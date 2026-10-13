import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { requirePageIdentity } from "@/components/evals/page-identity";
import { HelpArticlePage } from "@/components/evals/help-pages";
import { isHelpSlug } from "@/lib/evals/help/articles";
import { helpIndexFor } from "@/lib/evals/help/server";
import { resolveInterfaceLocale } from "@/lib/evals/interface-locale";
import { LOCALE_COOKIE } from "@/lib/evals/messages/en";

/**
 * One help article (launch L-20), in the person's interface language. The
 * Markdown is read from the generated index (content/help → build-help.ts),
 * so no file is opened per request.
 */
export default async function HelpArticleRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requirePageIdentity(`/workspace/help/${encodeURIComponent(slug)}`);
  if (!isHelpSlug(slug)) notFound();
  const locale = resolveInterfaceLocale((await cookies()).get(LOCALE_COOKIE)?.value, (await headers()).get("accept-language"));
  const { articles } = helpIndexFor(locale);
  const article = articles.find((item) => item.slug === slug);
  if (!article) notFound();
  const related = article.related.flatMap((target) => articles.filter((item) => item.slug === target)).map(({ slug, title, summary }) => ({ slug, title, summary }));
  return <HelpArticlePage article={article} related={related} />;
}
