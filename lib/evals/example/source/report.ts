import type { Severity, Text } from "./types";

/**
 * The reviewed-style October report: findings with failure causes,
 * improvements, takeaways (the executive summary) and the methodology text.
 * Findings and takeaways name cases (`c04`); the builder turns them into the
 * October run's assessment ids, and the fixture test fails if one does not
 * exist or is not a failure.
 */
export const EXAMPLE_SYSTEM = {
  name: { en: "{co} home-policy assistant", es: "Asistente de pólizas de hogar de {co}" },
  purpose: {
    en: "Answers policyholders' questions about the {product} home policy on the {co} website: cover, exclusions, excesses, claims, payments and changes.",
    es: "Responde en la web de {co} a las preguntas de los asegurados sobre la póliza de hogar {product}: coberturas, exclusiones, franquicias, siniestros, pagos y cambios.",
  },
} as const;

export type ExampleFinding = {
  id: string;
  severity: Severity;
  title: Text;
  observation: Text;
  cause: Text;
  recommendation: Text;
  cases: string[];
  /** Relevant assessed results the frequency is counted over. */
  denominator: { cases: string[] } | { topic: string };
};

export const EXAMPLE_FINDINGS: ExampleFinding[] = [
  {
    id: "example-finding-damp",
    severity: "critical",
    title: { en: "Says damp and gradual leaks are covered", es: "Dice que la humedad y las filtraciones graduales están cubiertas" },
    observation: {
      en: "Asked about damp and mould from a slow leak, the assistant said the damage is covered and offered an adjuster. The general conditions exclude damp, condensation, mould and gradual leaks (article 3b).",
      es: "Ante una pregunta sobre humedad y moho por una filtración lenta, el asistente dijo que el daño está cubierto y ofreció un perito. Las condiciones generales excluyen la humedad, la condensación, el moho y las filtraciones graduales (artículo 3 b).",
    },
    cause: {
      en: "The assistant appears to generalise from the water-damage cover without retrieving the exclusions article.",
      es: "El asistente parece generalizar a partir de la cobertura de daños por agua sin recuperar el artículo de exclusiones.",
    },
    recommendation: {
      en: "Add an answer that states the exclusion for damp, condensation, mould and gradual leaks, and require the assistant to cite article 3 whenever it answers about damp.",
      es: "Añadir una respuesta que indique la exclusión de humedad, condensación, moho y filtraciones graduales, y exigir que el asistente cite el artículo 3 cuando responda sobre humedades.",
    },
    cases: ["c14"],
    denominator: { topic: "exclusions" },
  },
  {
    id: "example-finding-jewellery",
    severity: "critical",
    title: { en: "Leaves out the safe condition for jewellery", es: "Omite la condición de la caja fuerte para las joyas" },
    observation: {
      en: "Both jewellery questions got the €3,000 limit without the condition that decides them: jewellery worth more than €1,500 is covered only in a locked safe. In October one answer said jewellery is covered wherever it is kept.",
      es: "Las dos preguntas sobre joyas recibieron el límite de 3.000 € sin la condición que las decide: las joyas de más de 1.500 € solo están cubiertas en una caja fuerte cerrada. En octubre, una respuesta dijo que las joyas están cubiertas estén donde estén.",
    },
    cause: {
      en: "The condition is a footnote in the table of limits; the answers follow the FAQ summary, which does not include it.",
      es: "La condición es una nota del cuadro de límites; las respuestas siguen el resumen de las preguntas frecuentes, que no la incluye.",
    },
    recommendation: {
      en: "Add the safe condition to the FAQ answer on jewellery and index the footnotes of the table of limits as part of each row.",
      es: "Añadir la condición de la caja fuerte a la respuesta de las preguntas frecuentes sobre joyas e indexar las notas del cuadro de límites junto a cada fila.",
    },
    cases: ["c09", "c10"],
    denominator: { cases: ["c09", "c10"] },
  },
  {
    id: "example-finding-water-excess",
    severity: "high",
    title: { en: "Quotes last year's water-damage excess", es: "Da la franquicia de daños por agua del año pasado" },
    observation: {
      en: "All three questions about the water-damage excess got last year's amount or a hedge: €150 twice, and \"€150 or €200, depending on your policy edition\" once. The 2026 conditions set €200, and the neighbour's damage has no excess at all.",
      es: "Las tres preguntas sobre la franquicia de daños por agua recibieron el importe del año pasado o una duda: 150 € dos veces y \"150 € o 200 €, según la edición de tu póliza\" una vez. Las condiciones de 2026 fijan 200 €, y los daños del vecino no tienen franquicia.",
    },
    cause: {
      en: "The assistant's sources still include the 2025 FAQ, which states a €150 excess.",
      es: "Las fuentes del asistente siguen incluyendo las preguntas frecuentes de 2025, que indican una franquicia de 150 €.",
    },
    recommendation: {
      en: "Remove the 2025 FAQ from the assistant's sources and re-run the three water-excess questions.",
      es: "Retirar las preguntas frecuentes de 2025 de las fuentes del asistente y repetir las tres preguntas sobre la franquicia de daños por agua.",
    },
    cases: ["c04", "c06", "c08"],
    denominator: { cases: ["c04", "c06", "c08"] },
  },
  {
    id: "example-finding-cancellation",
    severity: "high",
    title: { en: "Mixes up cancelling and the right of withdrawal", es: "Confunde la baja con el derecho de desistimiento" },
    observation: {
      en: "Asked how to cancel, the assistant described the 14-day right of withdrawal, with a refund for unused days, instead of the one-month notice before renewal. Asked about withdrawal, it gave the 14 days but not what is refunded.",
      es: "Al preguntar cómo dar de baja la póliza, el asistente describió el desistimiento de 14 días, con devolución de los días no cubiertos, en lugar del preaviso de un mes antes de la renovación. Al preguntar por el desistimiento, dio los 14 días pero no qué se devuelve.",
    },
    cause: {
      en: "Both rules are in article 7; the answers blend the two paragraphs.",
      es: "Las dos reglas están en el artículo 7; las respuestas mezclan los dos párrafos.",
    },
    recommendation: {
      en: "Write separate answers for cancelling at renewal and for withdrawing in the first 14 days, each with its own conditions.",
      es: "Redactar respuestas separadas para la baja en la renovación y para el desistimiento en los primeros 14 días, cada una con sus condiciones.",
    },
    cases: ["c32", "c33"],
    denominator: { topic: "changes" },
  },
  {
    id: "example-finding-payments",
    severity: "medium",
    title: { en: "Leaves payment questions unanswered", es: "Deja sin respuesta preguntas sobre pagos" },
    observation: {
      en: "Two of five payment questions still get a fallback menu or \"I don't have that information\": changing the payment schedule and returned direct debits. The September FAQ update fixed the other two.",
      es: "Dos de cinco preguntas sobre pagos siguen recibiendo un menú alternativo o \"No tengo esa información\": cambiar el fraccionamiento y los recibos devueltos. La actualización de las preguntas frecuentes de septiembre corrigió las otras dos.",
    },
    cause: {
      en: "These topics are not in the assistant's knowledge base; the answers exist in article 6 and in the FAQ.",
      es: "Estos temas no están en la base de conocimiento del asistente; las respuestas existen en el artículo 6 y en las preguntas frecuentes.",
    },
    recommendation: {
      en: "Add article 6 and the payment FAQ to the assistant's sources and re-run the payment questions.",
      es: "Añadir el artículo 6 y las preguntas frecuentes de pagos a las fuentes del asistente y repetir las preguntas de pagos.",
    },
    cases: ["c24", "c26"],
    denominator: { topic: "payments" },
  },
  {
    id: "example-finding-glass",
    severity: "medium",
    title: { en: "New glass answer drops the screen exclusion", es: "La nueva respuesta sobre cristales omite la exclusión de pantallas" },
    observation: {
      en: "Correct in August and September, the answer about a cracked phone screen no longer says that screens are excluded. The customer has to infer it.",
      es: "La respuesta sobre la pantalla rota de un móvil, correcta en agosto y septiembre, ya no dice que las pantallas están excluidas. El cliente tiene que deducirlo.",
    },
    cause: {
      en: "The rewritten glass-breakage FAQ lists what is covered but not what is excluded.",
      es: "La nueva respuesta de las preguntas frecuentes sobre cristales enumera lo que se cubre, pero no lo que se excluye.",
    },
    recommendation: {
      en: "Restore the exclusion for phone, tablet, computer and TV screens in the glass-breakage answer.",
      es: "Recuperar la exclusión de pantallas de móviles, tabletas, ordenadores y televisores en la respuesta sobre rotura de cristales.",
    },
    cases: ["c13"],
    denominator: { topic: "cover" },
  },
];

export const EXAMPLE_IMPROVEMENTS: Array<{ id: string; title: Text; owner: Text; status: "proposed" | "planned" | "in_progress" | "validated" | "closed"; findings: string[]; plan: Text }> = [
  {
    id: "example-improvement-faq-2025",
    title: { en: "Remove the 2025 FAQ from the assistant's sources", es: "Retirar las preguntas frecuentes de 2025 de las fuentes del asistente" },
    owner: { en: "Digital channels team ({co})", es: "Equipo de canales digitales ({co})" },
    status: "planned", findings: ["example-finding-water-excess"],
    plan: { en: "Re-run the three water-excess questions on the same test set; all three should give €200 and no excess for the neighbour's damage.", es: "Repetir las tres preguntas de franquicia por agua con el mismo conjunto de pruebas; las tres deben dar 200 € y ninguna franquicia para los daños del vecino." },
  },
  {
    id: "example-improvement-damp",
    title: { en: "Add an answer on damp and gradual leaks", es: "Añadir una respuesta sobre humedades y filtraciones graduales" },
    owner: { en: "Claims knowledge team ({co})", es: "Equipo de conocimiento de siniestros ({co})" },
    status: "in_progress", findings: ["example-finding-damp"],
    plan: { en: "Re-run the five exclusion questions; the damp question must cite article 3(b) and say the damage is not covered.", es: "Repetir las cinco preguntas de exclusiones; la de humedades debe citar el artículo 3 b) y decir que el daño no está cubierto." },
  },
  {
    id: "example-improvement-jewellery",
    title: { en: "Add the safe condition to the jewellery answer", es: "Añadir la condición de la caja fuerte a la respuesta sobre joyas" },
    owner: { en: "Digital channels team ({co})", es: "Equipo de canales digitales ({co})" },
    status: "proposed", findings: ["example-finding-jewellery"],
    plan: { en: "Re-run both jewellery questions; each must state the €1,500 safe condition.", es: "Repetir las dos preguntas sobre joyas; ambas deben indicar la condición de la caja fuerte por encima de 1.500 €." },
  },
  {
    id: "example-improvement-cancellation",
    title: { en: "Separate the cancellation and withdrawal answers", es: "Separar las respuestas de baja y de desistimiento" },
    owner: { en: "Customer service ({co})", es: "Atención al cliente ({co})" },
    status: "proposed", findings: ["example-finding-cancellation"],
    plan: { en: "Re-run the six questions on changes and cancellation; the two cancellation questions must give the one-month notice.", es: "Repetir las seis preguntas de cambios y bajas; las dos de baja deben indicar el preaviso de un mes." },
  },
  {
    id: "example-improvement-payments",
    title: { en: "Add the payment rules to the assistant's sources", es: "Añadir las reglas de pago a las fuentes del asistente" },
    owner: { en: "Customer service ({co})", es: "Atención al cliente ({co})" },
    status: "in_progress", findings: ["example-finding-payments"],
    plan: { en: "Re-run the five payment questions; target five correct answers.", es: "Repetir las cinco preguntas de pagos; objetivo: cinco respuestas correctas." },
  },
  {
    id: "example-improvement-glass",
    title: { en: "Restore the screen exclusion in the glass answer", es: "Recuperar la exclusión de pantallas en la respuesta sobre cristales" },
    owner: { en: "Digital channels team ({co})", es: "Equipo de canales digitales ({co})" },
    status: "proposed", findings: ["example-finding-glass"],
    plan: { en: "Re-run the cracked-screen question; the answer must say that screens are excluded.", es: "Repetir la pregunta de la pantalla rota; la respuesta debe decir que las pantallas están excluidas." },
  },
];

/** The executive summary. Each takeaway cites findings and the October results behind it. */
export const EXAMPLE_TAKEAWAYS: Array<{ text: Text; findings: string[]; cases: string[] }> = [
  {
    text: {
      en: "35 of 46 assessed answers were correct (76%), up from 54% in August and 65% in September. Seven questions improved since September and two regressed.",
      es: "35 de 46 respuestas evaluadas fueron correctas (76 %), frente al 54 % de agosto y el 65 % de septiembre. Siete preguntas mejoraron desde septiembre y dos empeoraron.",
    },
    findings: [],
    cases: ["c22", "c23", "c31", "c11", "c16", "c27", "c08", "c13", "c10"],
  },
  {
    text: {
      en: "The costliest error is a wrong \"yes\": the assistant says damp and gradual leaks are covered, and the policy excludes them.",
      es: "El error más caro es un \"sí\" equivocado: el asistente dice que la humedad y las filtraciones graduales están cubiertas, y la póliza las excluye.",
    },
    findings: ["example-finding-damp"],
    cases: ["c14"],
  },
  {
    text: {
      en: "Jewellery answers leave out the safe condition, so a customer could expect a payment the policy does not give.",
      es: "Las respuestas sobre joyas omiten la condición de la caja fuerte, así que un cliente podría esperar un pago que la póliza no da.",
    },
    findings: ["example-finding-jewellery"],
    cases: ["c09", "c10"],
  },
  {
    text: {
      en: "All three answers about the water-damage excess are wrong or hedged because the assistant still uses last year's €150; removing the 2025 FAQ should fix all three.",
      es: "Las tres respuestas sobre la franquicia de daños por agua son erróneas o dudosas porque el asistente sigue usando los 150 € del año pasado; retirar las preguntas frecuentes de 2025 debería corregir las tres.",
    },
    findings: ["example-finding-water-excess"],
    cases: ["c04", "c06", "c08"],
  },
  {
    text: {
      en: "Two payment questions still get no answer; the September update fixed the other two, so adding article 6 to the sources should close the gap.",
      es: "Dos preguntas sobre pagos siguen sin respuesta; la actualización de septiembre corrigió las otras dos, así que añadir el artículo 6 a las fuentes debería cerrar el hueco.",
    },
    findings: ["example-finding-payments"],
    cases: ["c24", "c26", "c22", "c23"],
  },
];

export const EXAMPLE_METHODOLOGY = {
  sampling: {
    en: "A frozen test set of 48 questions written from the five synthetic source documents and used unchanged in all three monthly runs; no question was added or removed after seeing results.",
    es: "Un conjunto de pruebas congelado de 48 preguntas escritas a partir de los cinco documentos fuente sintéticos y usado sin cambios en las tres ejecuciones mensuales; no se añadió ni retiró ninguna pregunta después de ver los resultados.",
  },
  reviewCoverage: {
    en: "Every assessed result of the October run is marked as approved by a reviewer. In this example the review is simulated: no real expert reviewed it.",
    es: "Todos los resultados evaluados de la ejecución de octubre figuran como aprobados por un revisor. En este ejemplo la revisión es simulada: ningún experto real la ha hecho.",
  },
  limitations: [
    {
      en: "Synthetic example: the company, its documents, the assistant's answers and the review are invented to show what a report contains.",
      es: "Ejemplo sintético: la empresa, sus documentos, las respuestas del asistente y la revisión son inventados para mostrar qué contiene un informe.",
    },
    {
      en: "Likely causes are hypotheses drawn from the evidence; they have not been verified with the system owner.",
      es: "Las causas probables son hipótesis extraídas de las evidencias; no se han verificado con el responsable del sistema.",
    },
  ],
} as const;

/** Run dates (UTC). The October run is the reviewed report. */
export const EXAMPLE_RUNS = [
  { key: "2026-08", started: "2026-08-05T09:00:00.000Z", finished: "2026-08-05T09:41:00.000Z", reported: "2026-08-05T10:05:00.000Z" },
  { key: "2026-09", started: "2026-09-04T09:00:00.000Z", finished: "2026-09-04T09:38:00.000Z", reported: "2026-09-04T10:02:00.000Z" },
  { key: "2026-10", started: "2026-10-05T09:00:00.000Z", finished: "2026-10-05T09:36:00.000Z", reported: "2026-10-07T15:30:00.000Z" },
] as const;
