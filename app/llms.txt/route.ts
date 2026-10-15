import { getBlogPosts } from "@/lib/blog/posts";
import { sampleReportIndexed } from "@/lib/evals/example/flags";
import { SAMPLE_REPORT_PATH } from "@/lib/evals/example/public";
import { getTranslator } from "@/lib/i18n/server";
import { localizePathname } from "@/lib/i18n/routing";
import { getPublishedIssues } from "@/lib/newsletter/client";
import { directSignupEnabled } from "@/lib/evals/signup";
import { RESULTS_PATH } from "@/lib/publication/contracts";
import { indexedPublicResultPages } from "@/lib/publication/indexed";
import { renderEvaluationOverviewMarkdown } from "@/lib/public/evaluation-offers";
import { METHODOLOGY_PATH } from "@/lib/methodology/content";
import { demoPublicEnabled } from "@/lib/public/front-door";
import { SECTOR_IDS, SECTORS_HUB_PATH, sectorPath } from "@/lib/public/sectors";
import { getSectorCopy } from "@/lib/sectors/content";
import { buildAppUrl, buildMarketingUrl } from "@/lib/seo";

// Five minutes, so the free test's entry follows the runtime DEMO_PUBLIC flag
// soon after a restart (launch L-04), and published results pages follow
// PUBLIC_RESULTS_INDEXED and their owners' consent (launch L-31, gap G3).
export const revalidate = 300;

function cleanMarkdownLabel(value: string) {
  return value.replaceAll("[", "\\[").replaceAll("]", "\\]").replace(/\s+/g, " ").trim();
}

export async function GET() {
  const [posts, issues, results] = await Promise.all([
    getBlogPosts("es"),
    getPublishedIssues(20),
    indexedPublicResultPages(),
  ]);
  // Offers and prices come from the same messages as the landing page.
  const t = getTranslator("es");
  /** Spanish is the body language of this file, so links point at `/es`. */
  const url = (pathname: string) =>
    buildMarketingUrl(localizePathname(pathname, "es"));

  const sectorLinks = SECTOR_IDS.map((id) => {
    const copy = getSectorCopy(id, "es");
    return `- [${cleanMarkdownLabel(copy.metaTitle)}](${url(sectorPath(id))}): ${copy.summary} Para: ${copy.audience.toLowerCase()}.`;
  }).join("\n");

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

  // "Empezar" lists the offers in the site's order (launch L-04, L-05, L-20,
  // L-30): the free test, the free account, credits in the app (no prices,
  // D-06), pilots at a fixed price quoted before we start, and the manual
  // diagnostic last.
  const demoLink = demoPublicEnabled()
    ? `- [Prueba gratuita](${url("/demo")}): pega la dirección de tu asistente, chatbot o API; escribimos ocho preguntas a partir de tu propia web, se las hacemos y comprobamos cada respuesta con la página de la que sale. Gratis, sin cuenta, unos 3 minutos.\n`
    : "";
  const accountLink = directSignupEnabled()
    ? `- [${t("pricing.offers.freeAccount.name")}](${buildAppUrl("/workspace/start")}): ${t("pricing.offers.freeAccount.price")}, ${t("pricing.offers.freeAccount.duration").toLowerCase()}. ${t("pricing.offers.freeAccount.summary")}\n`
    : "";
  // Published results (launch L-31, gap G3): only once the founder indexes them,
  // and only pages whose owner's written consent still stands.
  const resultsSection = results.length
    ? `## Resultados publicados

Páginas de resultados que sus propietarios aceptaron publicar por escrito; desaparecen si retiran el consentimiento. Cada una describe una muestra de preguntas en las fechas indicadas y cuántas respuestas coincidieron con las fuentes del propio sistema. Es evidencia de una muestra, no una certificación ni una evaluación de conformidad.

${results.map((page) => `- [${cleanMarkdownLabel(page.projection.public_name)}](${url(`${RESULTS_PATH}/${page.slug}`)}): ${cleanMarkdownLabel(page.projection.scope_summary)} Publicado el ${page.publishedAt.slice(0, 10)}.`).join("\n")}

`
    : "";
  // Listed once the founder has read the example (SAMPLE_REPORT_INDEXED, launch L-33).
  const sampleReportLink = sampleReportIndexed()
    ? `- [Informe de ejemplo](${url(SAMPLE_REPORT_PATH)}): un informe de evaluación completo sobre el asistente de una aseguradora ficticia, con datos sintéticos: hallazgos con causas probables, 48 preguntas con sus respuestas y fuentes, la evolución de tres meses y una comparación; descargable en PDF.\n`
    : "";

  const body = `# Caudals

> Caudals evalúa los asistentes, chatbots y agentes de IA de las empresas con un conjunto de pruebas construido a partir de su propia documentación y validado por expertos de dominio de Caudals. Entrega un informe con puntuación y evidencias, repite la evaluación cada mes y convierte los fallos que encuentra en los datos que los corrigen.

Caudals es una empresa de datos para IA con sede en Valladolid (España). Evalúa sistemas de IA de texto y documentos (asistentes y chatbots para clientes en web, app o WhatsApp, agentes de voz e IVR, asistentes internos, procesamiento de documentos y funciones de IA dentro de productos) y se centra en sistemas en los que una respuesta equivocada cuesta dinero: coberturas y carencias, comisiones, tarifas, derechos de reembolso o especificaciones técnicas. Cada caso cita el documento del que sale y nuestros expertos de dominio validan las respuestas correctas antes de ejecutar nada. Los casos se escriben en español, tal como preguntan los clientes.

Caudals mide y aporta evidencias: no certifica sistemas de IA ni realiza evaluaciones de conformidad con el Reglamento Europeo de IA.

${renderEvaluationOverviewMarkdown(t)}

## Metodología

- [Metodología](${url(METHODOLOGY_PATH)}): cómo escribimos las preguntas a partir de las fuentes del cliente, cómo calificamos las respuestas por su significado, qué significa cada etiqueta, tamaños de muestra e intervalos del 95 %, niveles de revisión, límites y lo que nunca hacemos (pruebas adversarias sin autorización por escrito, certificaciones). También en inglés: ${buildMarketingUrl(localizePathname(METHODOLOGY_PATH, "en"))}.

## Sectores

Cada sector tiene su página con ejemplos de fallos reales de asistentes, qué evaluamos, qué expertos validan las respuestas y preguntas frecuentes. [Todos los sectores](${url(SECTORS_HUB_PATH)}).

${sectorLinks}

## Empezar

${demoLink}${accountLink}- [${t("pricing.offers.payAsYouGo.name")}](${buildAppUrl("/workspace/sign-in")}): ${t("pricing.offers.payAsYouGo.summary")} Los precios se muestran en la aplicación.
- [Solicitar una evaluación piloto](${url("/contact")}?offer=pilot-evaluation): formulario de cinco campos (nombre completo, correo corporativo, empresa, sector y qué debería cubrir el piloto). Un piloto prueba tu asistente con entre 150 y 300 preguntas revisadas por expertos de tu sector, con un precio cerrado que presupuestamos antes de empezar; respondemos en 24 horas.
- [${t("pricing.offers.realityCheck.name")}](${url("/contact")}?offer=reality-check): ${t("pricing.offers.realityCheck.summary")}

## Hablar con Caudals

- [Reservar una llamada](${url("/call")}): 30 minutos para revisar qué responde un sistema de IA, cómo se prueba hoy y qué cubriría una evaluación.
${sampleReportLink}
${resultsSection}## Información legal

- [Términos del servicio](${url("/legal/terms")}): condiciones de uso de Caudals, solo para empresas: plan gratuito, créditos, reembolsos, uso aceptable y ley española.
- [Política de privacidad](${url("/legal/privacy")}): qué datos personales tratamos, para qué, durante cuánto tiempo y tus derechos.
- [Contrato de encargo del tratamiento](${url("/legal/dpa")}): cómo tratamos datos personales por cuenta del cliente (artículo 28 del RGPD), con una plantilla descargable.
- [Subencargados](${url("/legal/subprocessors")}): proveedores que tratan datos personales por cuenta de Caudals, su finalidad y su ubicación.
- [Seguridad](${url("/legal/security")}): cómo protegemos los datos: alojamiento en Alemania, cifrado, separación entre clientes, control de acceso y conservación.
- [Política de cookies](${url("/legal/cookies")}): uso de cookies y tecnologías similares.
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
