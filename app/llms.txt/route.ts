import { CAUDALS_AUTHORS } from "@/lib/authors";
import { getBlogPosts } from "@/lib/blog/posts";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { buildMarketingUrl } from "@/lib/seo";

export const revalidate = 3600;

function cleanMarkdownLabel(value: string) {
  return value.replaceAll("[", "\\[").replaceAll("]", "\\]").replace(/\s+/g, " ").trim();
}

export async function GET() {
  const [posts, issues] = await Promise.all([
    getBlogPosts("es"),
    getPublishedIssues(20),
  ]);

  const blogLinks = posts
    .map(
      (post) =>
        `- [${cleanMarkdownLabel(post.title)}](${buildMarketingUrl(`/blog/${post.slug}`)}): ${post.excerpt}`,
    )
    .join("\n");
  const newsletterLinks = issues
    .map(
      (issue) =>
        `- [${cleanMarkdownLabel(issue.title)}](${buildMarketingUrl(`/newsletter/${issue.slug}`)})${issue.dek ? `: ${issue.dek}` : ""}`,
    )
    .join("\n");
  const authorLinks = CAUDALS_AUTHORS.map(
    (author) =>
      `- [${author.name}](${buildMarketingUrl(`/equipo/${author.slug}`)}): ${author.headline}`,
  ).join("\n");

  const body = `# Caudals

> Caudals es una empresa y marketplace B2B de datasets para inteligencia artificial. Ayuda a empresas a monetizar datos propios y a equipos de IA a obtener datasets limpios, documentados, licenciados y listos para entrenamiento, fine-tuning y evaluación.

Caudals se ocupa de la obtención de datos, revisión de derechos, negociación con proveedores, limpieza, normalización, anonimización, enriquecimiento, etiquetado, control de calidad, documentación y entrega. La empresa opera desde España y trabaja con necesidades de datos internacionales.

## Servicios principales

- [Datasets profesionales para IA](${buildMarketingUrl("/")}): descripción de los servicios de obtención, preparación y entrega de datasets a medida.
- [Contacto](${buildMarketingUrl("/contact")}): canal para solicitar un dataset, proponer datos para monetización o definir un proyecto piloto.
- [Reservar una reunión](${buildMarketingUrl("/call")}): reunión de descubrimiento para revisar viabilidad, fuentes, calidad, derechos y plazos.

## Conocimiento y publicaciones

- [Blog de Caudals](${buildMarketingUrl("/blog")}): guías técnicas y operativas sobre recopilación, calidad, fine-tuning, RLHF y operaciones de datasets.
${blogLinks || "- El archivo de artículos se publicará en esta sección."}

## Newsletter

- [Data Unfiltered](${buildMarketingUrl("/newsletter")}): análisis periódico sobre herramientas de IA y los datos que utilizan los modelos.
${newsletterLinks || "- Los números publicados aparecerán en esta sección."}

## Equipo y autoridad editorial

- [Equipo de Caudals](${buildMarketingUrl("/equipo")}): perfiles del equipo fundador y su experiencia técnica.
${authorLinks}

## Información legal

- [Política de cookies](${buildMarketingUrl("/legal/cookies")}): uso de cookies y tecnologías similares.
- [Política de privacidad](${buildMarketingUrl("/legal/privacy")}): tratamiento y protección de datos personales.
- [Aviso legal](${buildMarketingUrl("/legal/notice")}): titularidad y condiciones legales del sitio.

## Acceso para agentes

Todas las páginas públicas admiten negociación de contenido: una petición con la cabecera \`Accept: text/markdown\` devuelve el contenido en Markdown limpio en lugar de HTML. La respuesta incluye \`Content-Type: text/markdown\`, \`Vary: Accept\` y \`x-markdown-tokens\` con una estimación de tokens.

## Contacto

- Correo: hello@caudals.com
- Sede: Valladolid, España
- Web canónica: ${buildMarketingUrl("/")}
`;

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
