import { locales, type Locale } from "@/lib/i18n/config";
import {
  dpaTemplateDownloadName,
  dpaTemplateFileName,
  renderDpaTemplate,
} from "@/lib/legal/dpa-template";
import { getLegalEntity } from "@/lib/legal/entity";

// The template names the company from runtime data (LEGAL_ENTITY_*), so it is
// built per request rather than at image build time.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FILES = new Map<string, Locale>(
  locales.map((locale) => [dpaTemplateFileName(locale), locale]),
);

/**
 * `/legal/caudals-dpa-en.docx` and `/legal/caudals-dpa-es.docx`: the DPA
 * template linked from `/legal/dpa`. A path with an extension stays outside
 * the locale tree (`isNonLocalizedPath`), so this static segment answers it;
 * every other name is a 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const locale = FILES.get(file);
  if (!locale) {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = await renderDpaTemplate(locale, getLegalEntity());
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${dpaTemplateDownloadName(locale)}"`,
      "Cache-Control": "public, max-age=0, s-maxage=600",
      "X-Robots-Tag": "noindex",
    },
  });
}
