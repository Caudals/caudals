import { getBlogPosts } from "@/lib/blog/posts";
import { getTranslator } from "@/lib/i18n/server";
import { localizePathname } from "@/lib/i18n/routing";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { renderEvaluationOverviewMarkdown } from "@/lib/public/evaluation-offers";
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
  // Offers and prices come from the same messages as the landing page.
  const t = getTranslator("es");
  /** Spanish is the body language of this file, so links point at `/es`. */
  const url = (pathname: string) =>
    buildMarketingUrl(localizePathname(pathname, "es"));

  const blogLinks = posts
    .map(
      (post) =>
        `- [${cleanMarkdownLabel(post.title)}](${url(`/blog/${post.slug}`)}): ${post.excerpt}`,
    )
    .join("\n");
  const newsletterLinks = issues
    .map(
      (issue) =>
        `- [${cleanMarkdownLabel(issue.title)}](${url(`/newsletter/${issue.slug}`)})${issue.dek ? `: ${issue.dek}` : ""}`,
    )
    .join("\n");

  const body = `# Caudals

> Caudals evalúa los asistentes, chatbots y agentes de IA de las empresas con un conjunto de pruebas construido a partir de su propia documentación y validado por expertos de dominio de Caudals. Entrega un informe con puntuación y evidencias, repite la evaluación cada mes y convierte los fallos que encuentra en los datos que los corrigen.

Caudals es una empresa de datos para IA con sede en Valladolid (España). Evalúa sistemas de IA de texto y documentos (asistentes y chatbots para clientes en web, app o WhatsApp, agentes de voz e IVR, asistentes internos, procesamiento de documentos y funciones de IA dentro de productos) y se centra en sistemas en los que una respuesta equivocada cuesta dinero: coberturas y carencias, comisiones, tarifas, derechos de reembolso o especificaciones técnicas. Cada caso cita el documento del que sale y nuestros expertos de dominio validan las respuestas correctas antes de ejecutar nada. Los casos se escriben en español, tal como preguntan los clientes.

Caudals mide y aporta evidencias: no certifica sistemas de IA ni realiza evaluaciones de conformidad con el Reglamento Europeo de IA.

${renderEvaluationOverviewMarkdown(t)}

## Empezar

- [Solicitar una evaluación](${url("/contact")}): formulario para pedir un Diagnóstico inicial gratuito o una evaluación; recoge el tipo de sistema, el sector, quién es responsable del sistema y qué responde.
- [Reservar una llamada](${url("/call")}): 30 minutos para revisar qué responde un sistema de IA, cómo se prueba hoy y qué cubriría una evaluación.


## Información legal

- [Política de cookies](${url("/legal/cookies")}): uso de cookies y tecnologías similares.
- [Política de privacidad](${url("/legal/privacy")}): tratamiento y protección de datos personales.
- [Aviso legal](${url("/legal/notice")}): titularidad y condiciones legales del sitio.

## Versión en inglés

- [Caudals in English](${buildMarketingUrl(localizePathname("/", "en"))}): the same site in English. Every public page exists at both \`/es/…\` and \`/en/…\`, and each one declares the other as an \`hreflang\` alternate.

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
