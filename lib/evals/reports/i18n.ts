/**
 * Language of exported reports (PDF, Word). Labels come from these tables.
 * Report content keeps its own words: questions, answers and model-written
 * text stay as recorded. Sentences that Caudals itself generates from
 * templates (finding summaries, default takeaways, methodology notes) are
 * rendered in the report's language by `localizeReportText`.
 */
export type ReportLocale = "en" | "es";

const EN = {
  evaluationReport: "Evaluation report", evaluationOf: "Evaluation of", evaluated: "Evaluated", whatWasTested: "What was tested",
  evidencePolicy: "Evidence policy", testsAssessed: "Tests assessed", of: "of", eligible: "eligible", reviewStatus: "Review status",
  resultStatus: "Result status", incompleteResult: "Incomplete result.",
  incompleteHelp: "Assessed coverage is below the reporting threshold or a critical test was not assessed. Read these limitations before using the score:",
  strictPassRate: "Strict pass rate", assessedTestsPassed: "assessed tests passed", interval95: "95% interval", assessedCoverage: "Assessed coverage",
  criticalFailures: "Critical failures", criticalNotAssessed: "critical not assessed", criticalFailedOrPartial: "critical tests failed or partial",
  rubricScore: "Rubric score", findings: "Findings", weightedCriteria: "weighted criteria", evidencePatterns: "evidence-backed patterns",
  keyTakeaways: "Key takeaways", evidence: "Evidence", resultsAtAGlance: "Results at a glance",
  ratesLead: "Rates count strict passes over assessed tests in each group. Groups with few tests are indicative only.",
  byTopic: "By topic", bySeverity: "By severity", noAssessedTopics: "No assessed topics.", noAssessedTests: "No assessed tests.",
  outcomesBySeverity: "Outcomes by severity", severity: "Severity",
  findingsLead: "Patterns supported by the assessed results, most severe first. Hypotheses are labelled as such; they are not verified causes.",
  relevantResults: "relevant results", tests: "Tests", observed: "Observed", hypothesis: "Hypothesis", notVerifiedCause: "not a verified root cause",
  recommendedAction: "Recommended action", noFindings: "No supported failure pattern was found in the assessed results.",
  improvements: "Improvements", improvementsLead: "Prioritised changes and how each will be validated with a comparable re-run. Creating a task never changes your system.",
  improvement: "Improvement", status: "Status", validationPlan: "Validation plan", owner: "Owner", addresses: "Addresses",
  noImprovements: "No improvement tasks have been proposed for this revision.", testResults: "Test results",
  testResultsLead: "Every assessed test, failures first. The numbers (T1, T2…) match the evidence appendix.",
  test: "Test", outcome: "Outcome", assessment: "Assessment", interactionEvidence: "Interaction evidence",
  evidenceLead: "The exact question sent, the response captured and the assessment, with the identifiers needed to trace each result.",
  caseId: "Case", observationId: "Observation", assessmentId: "Assessment", question: "Question", systemResponse: "System response",
  sources: "Sources", noResults: "No results are included in this revision.", methodologyLimitations: "Methodology and limitations",
  denominatorsLead: "Every rate in this report states which of these counts it divides by.", planned: "Planned", eligibleCap: "Eligible",
  executed: "Executed", assessed: "Assessed", notScored: "Not scored", pending: "Pending", scope: "Scope", languages: "languages",
  sampling: "Sampling", reviewCoverage: "Review coverage", scoring: "Scoring", graders: "graders", missingBounds: "Missing-result bounds",
  missingBoundsHelp: "of eligible tests (not a confidence interval)", uncertainty: "Uncertainty", wilson: "95% Wilson interval on the strict pass rate",
  sourceRevision: "source revision", sourceRevisions: "source revisions", testSet: "Test set", run: "Run", reportRevision: "Report revision",
  contentHash: "Content hash", limitations: "Limitations", noLimitations: "No additional limitations were recorded.",
  disclaimer: "This report presents evaluation evidence for the tested scope, sample and dates above. It is not a certification and does not establish regulatory compliance, general safety or business impact. Results for a deployed system describe that system as observed, not its underlying model.",
  revision: "Revision", page: "Page", pageOf: "of", resultsAtAGlanceWord: "Results at a glance", measure: "Measure", value: "Value",
  outcomes: "Outcomes", testsPlannedExecuted: "Tests planned / executed", criticalNotAssessedLong: "Critical tests not assessed",
  pass: "pass", partial: "partial", fail: "fail", notScoredLower: "not scored", seenIn: "Seen in", likelyCause: "Likely cause",
  recommendation: "Recommendation", topic: "Topic", title: "Title", howValidated: "How it will be validated", why: "Why", answer: "Answer",
  item: "Item", detail: "Detail", evaluationFormat: "Evaluation format", scorerWord: "scorer", excludedFromScoring: "Excluded from scoring",
  modelCost: "Model cost", settled: "settled", noFindingsShort: "No failure patterns were found in the assessed results.",
  scoredWord: "scored", preliminaryResults: "results", notCertification: "Caudals reports evidence about observed behaviour on this test set. It is not a certification or a conformity assessment.",
  eyebrow: "CAUDALS · EVALUATION REPORT",
  expectedAnswer: "Expected answer", offeredOptions: "Buttons offered",
  sharedCopy: "Shared copy: the sender chose which sections of the report to include.", identifiers: "Identifiers",
};
type Strings = typeof EN;

const ES: Strings = {
  evaluationReport: "Informe de evaluación", evaluationOf: "Evaluación de", evaluated: "Evaluado", whatWasTested: "Qué se probó",
  evidencePolicy: "Política de evidencias", testsAssessed: "Pruebas evaluadas", of: "de", eligible: "elegibles", reviewStatus: "Estado de revisión",
  resultStatus: "Estado del resultado", incompleteResult: "Resultado incompleto.",
  incompleteHelp: "La cobertura evaluada está por debajo del umbral o una prueba crítica no se evaluó. Lee estas limitaciones antes de usar la puntuación:",
  strictPassRate: "Tasa de acierto estricta", assessedTestsPassed: "pruebas evaluadas superadas", interval95: "intervalo del 95 %", assessedCoverage: "Cobertura evaluada",
  criticalFailures: "Fallos críticos", criticalNotAssessed: "críticas sin evaluar", criticalFailedOrPartial: "pruebas críticas falladas o parciales",
  rubricScore: "Puntuación de rúbrica", findings: "Hallazgos", weightedCriteria: "criterios ponderados", evidencePatterns: "patrones respaldados por evidencias",
  keyTakeaways: "Conclusiones clave", evidence: "Evidencia", resultsAtAGlance: "Resultados de un vistazo",
  ratesLead: "Las tasas cuentan los aciertos estrictos sobre las pruebas evaluadas de cada grupo. Los grupos con pocas pruebas son solo orientativos.",
  byTopic: "Por tema", bySeverity: "Por gravedad", noAssessedTopics: "No hay temas evaluados.", noAssessedTests: "No hay pruebas evaluadas.",
  outcomesBySeverity: "Resultados por gravedad", severity: "Gravedad",
  findingsLead: "Patrones respaldados por los resultados evaluados, de mayor a menor gravedad. Las hipótesis se indican como tales; no son causas verificadas.",
  relevantResults: "resultados relevantes", tests: "Pruebas", observed: "Observado", hypothesis: "Hipótesis", notVerifiedCause: "no es una causa raíz verificada",
  recommendedAction: "Acción recomendada", noFindings: "No se ha encontrado ningún patrón de fallo respaldado en los resultados evaluados.",
  improvements: "Mejoras", improvementsLead: "Cambios priorizados y cómo se validará cada uno con una nueva ejecución comparable. Crear una tarea nunca modifica tu sistema.",
  improvement: "Mejora", status: "Estado", validationPlan: "Plan de validación", owner: "Responsable", addresses: "Aborda",
  noImprovements: "No se han propuesto tareas de mejora para esta revisión.", testResults: "Resultados de las pruebas",
  testResultsLead: "Todas las pruebas evaluadas, primero las fallidas. Los números (T1, T2…) coinciden con el anexo de evidencias.",
  test: "Prueba", outcome: "Resultado", assessment: "Evaluación", interactionEvidence: "Evidencia de las interacciones",
  evidenceLead: "La pregunta exacta enviada, la respuesta capturada y la evaluación, con los identificadores necesarios para trazar cada resultado.",
  caseId: "Caso", observationId: "Observación", assessmentId: "Evaluación", question: "Pregunta", systemResponse: "Respuesta del sistema",
  sources: "Fuentes", noResults: "Esta revisión no incluye resultados.", methodologyLimitations: "Metodología y limitaciones",
  denominatorsLead: "Cada tasa de este informe indica entre cuál de estos recuentos divide.", planned: "Planificadas", eligibleCap: "Elegibles",
  executed: "Ejecutadas", assessed: "Evaluadas", notScored: "Sin puntuar", pending: "Pendientes", scope: "Alcance", languages: "idiomas",
  sampling: "Muestreo", reviewCoverage: "Cobertura de revisión", scoring: "Puntuación", graders: "calificadores", missingBounds: "Límites por resultados ausentes",
  missingBoundsHelp: "de las pruebas elegibles (no es un intervalo de confianza)", uncertainty: "Incertidumbre", wilson: "Intervalo de Wilson al 95 % de la tasa de acierto estricta",
  sourceRevision: "revisión de fuente", sourceRevisions: "revisiones de fuente", testSet: "Conjunto de pruebas", run: "Ejecución", reportRevision: "Revisión del informe",
  contentHash: "Hash del contenido", limitations: "Limitaciones", noLimitations: "No se han registrado limitaciones adicionales.",
  disclaimer: "Este informe presenta evidencias de evaluación para el alcance, la muestra y las fechas indicados. No es una certificación ni acredita el cumplimiento normativo, la seguridad general ni el impacto en el negocio. Los resultados de un sistema desplegado describen ese sistema tal como se observó, no su modelo subyacente.",
  revision: "Revisión", page: "Página", pageOf: "de", resultsAtAGlanceWord: "Resultados de un vistazo", measure: "Medida", value: "Valor",
  outcomes: "Resultados", testsPlannedExecuted: "Pruebas planificadas / ejecutadas", criticalNotAssessedLong: "Pruebas críticas sin evaluar",
  pass: "superadas", partial: "parciales", fail: "fallidas", notScoredLower: "sin puntuar", seenIn: "Observado en", likelyCause: "Causa probable",
  recommendation: "Recomendación", topic: "Tema", title: "Título", howValidated: "Cómo se validará", why: "Por qué", answer: "Respuesta",
  item: "Elemento", detail: "Detalle", evaluationFormat: "Formato de evaluación", scorerWord: "puntuador", excludedFromScoring: "Excluido de la puntuación",
  modelCost: "Coste de modelos", settled: "liquidado", noFindingsShort: "No se han encontrado patrones de fallo en los resultados evaluados.",
  scoredWord: "puntuadas", preliminaryResults: "resultados", notCertification: "Caudals aporta evidencias sobre el comportamiento observado en este conjunto de pruebas. No es una certificación ni una evaluación de conformidad.",
  eyebrow: "CAUDALS · INFORME DE EVALUACIÓN",
  expectedAnswer: "Respuesta esperada", offeredOptions: "Botones ofrecidos",
  sharedCopy: "Copia compartida: quien la envía eligió qué secciones del informe incluir.", identifiers: "Identificadores",
};

const LABEL_ES: Record<string, string> = {
  Pass: "Superada", Partial: "Parcial", Fail: "Fallida", "Not scored": "Sin puntuar",
  Correct: "Correcta", "Partly correct": "Parcialmente correcta", Incorrect: "Incorrecta", "No answer": "Sin respuesta",
  "Test needs review": "Prueba en revisión", "Not captured": "No capturada", "Not run": "No ejecutada", Critical: "Crítica", High: "Alta", Medium: "Media", Low: "Baja",
  Preliminary: "Preliminar", Reviewed: "Revisado", Complete: "Completo", Incomplete: "Incompleto", "Deployed system": "Sistema desplegado",
  "Controlled model": "Modelo controlado", "Imported answers": "Respuestas importadas", Exploratory: "Exploratoria", "Source-grounded": "Basada en fuentes",
  Proposed: "Propuesta", Planned: "Planificada", "In progress": "En curso", Validated: "Validada", Closed: "Cerrada",
};

export function reportStrings(locale: ReportLocale): Strings {
  return locale === "es" ? ES : EN;
}
export function reportLabel(english: string, locale: ReportLocale) {
  return locale === "es" ? LABEL_ES[english] ?? english : english;
}
export function reportDate(value: string, locale: ReportLocale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const FIXED_ES: Record<string, string> = {
  "Inspect the linked evidence, correct the supported system behavior, and validate with the unchanged case revisions.":
    "Revisa la evidencia vinculada, corrige el comportamiento respaldado del sistema y valida con las mismas revisiones de los casos.",
  "Apply the supported change and rerun the same frozen case revisions.": "Aplica el cambio respaldado y vuelve a ejecutar las mismas revisiones congeladas de los casos.",
  "Coverage is incomplete; the headline score does not describe unassessed eligible tests.": "La cobertura es incompleta; la puntuación principal no describe las pruebas elegibles sin evaluar.",
  "Frozen suite membership; no post-result selection.": "Composición del conjunto congelada; sin selección posterior a los resultados.",
  "Evaluation of the agreed system behavior.": "Evaluación del comportamiento acordado del sistema.",
  "Execution and measurements were reported by a customer-controlled private runner. Its signature binds submitted bytes to the paired runner key, not to proof that the system produced them.":
    "La ejecución y las mediciones las informó un ejecutor privado controlado por el cliente. Su firma vincula los datos enviados a la clave del ejecutor emparejado, no demuestra que el sistema los produjera.",
  "Follow-up user turns and tool results were scripted from the frozen tests, not written by a person or taken from live systems. Per-turn usage is estimated where the system did not report it.":
    "Los turnos de seguimiento y los resultados de herramientas se generaron a partir de las pruebas congeladas, no los escribió una persona ni proceden de sistemas reales. El uso por turno se estima cuando el sistema no lo informó.",
  "The assistant did not answer": "El asistente no respondió",
  "Answers with wrong information": "Respuestas con información incorrecta",
  "Answers that contradict your documentation": "Respuestas que contradicen tu documentación",
  "Incomplete answers": "Respuestas incompletas",
  "Answers to a different question": "Respuestas a otra pregunta",
  "Other failed answers": "Otras respuestas fallidas",
  "Check that these topics are covered by the assistant's knowledge and that its fallback does not trigger on clear, in-scope questions.":
    "Comprueba que estos temas están cubiertos por el conocimiento del asistente y que su respuesta por defecto no salta ante preguntas claras y dentro de su ámbito.",
  "Correct or update the content the assistant relies on for these topics, then re-run the same tests to confirm the fix.":
    "Corrige o actualiza el contenido en el que se apoya el asistente para estos temas y vuelve a ejecutar las mismas pruebas para confirmar la corrección.",
  "Find the outdated or conflicting source the assistant used, remove or correct it, and re-run the same tests.":
    "Localiza la fuente desactualizada o contradictoria que usó el asistente, elimínala o corrígela y vuelve a ejecutar las mismas pruebas.",
  "Make sure the complete information (conditions, limits, alternatives) is available to the assistant and that answers are not cut short.":
    "Asegúrate de que el asistente dispone de la información completa (condiciones, límites, alternativas) y de que las respuestas no se cortan.",
  "Review how the assistant routes and retrieves content for these questions.": "Revisa cómo el asistente enruta y recupera el contenido para estas preguntas.",
  "Inspect the linked answers, correct the system behaviour and re-run the same tests.": "Revisa las respuestas vinculadas, corrige el comportamiento del sistema y vuelve a ejecutar las mismas pruebas.",
  unsupported: "no admitidas", transport_error: "error de red", timeout: "tiempo agotado", capture_incomplete: "captura incompleta",
  canceled: "canceladas", unknown_external_outcome: "resultado externo desconocido", disputed: "disputadas", invalid_case: "caso no válido",
};

/**
 * Translate sentences Caudals generates from templates. Anything else
 * (customer or model text) is returned unchanged.
 */
export function localizeReportText(text: string, locale: ReportLocale): string {
  if (locale !== "es" || !text) return text;
  if (FIXED_ES[text]) return FIXED_ES[text];
  let match = text.match(/^(\d+) assessed results? showed (.+)\.$/);
  if (match) return `${match[1]} ${match[1] === "1" ? "resultado evaluado mostró" : "resultados evaluados mostraron"} ${match[2].replace(/criterion failure/, "incumplimiento de criterios")}.`;
  match = text.match(/^(.+): (\d+) of (\d+) relevant assessed results\.$/);
  if (match) return `${localizeReportText(match[1], locale)}: ${match[2]} de ${match[3]} resultados evaluados relevantes.`;
  match = text.match(/^(\d+) of (\d+) questions got no usable answer: the assistant deflected, asked to rephrase or offered options without answering\.$/);
  if (match) return `${match[1]} de ${match[2]} preguntas no recibieron una respuesta útil: el asistente se desvió, pidió reformular u ofreció opciones sin responder.`;
  match = text.match(/^(\d+) of (\d+) answers stated information that does not match your documentation\.$/);
  if (match) return `${match[1]} de ${match[2]} respuestas dieron información que no coincide con tu documentación.`;
  match = text.match(/^(\d+) of (\d+) answers contradicted what your documentation says\.$/);
  if (match) return `${match[1]} de ${match[2]} respuestas contradijeron lo que dice tu documentación.`;
  match = text.match(/^(\d+) of (\d+) answers were right as far as they went but left out key facts\.$/);
  if (match) return `${match[1]} de ${match[2]} respuestas eran correctas en lo que decían, pero omitieron datos clave.`;
  match = text.match(/^(\d+) of (\d+) answers addressed a different question than the one asked\.$/);
  if (match) return `${match[1]} de ${match[2]} respuestas trataron una pregunta distinta de la planteada.`;
  match = text.match(/^(\d+) of (\d+) answers did not meet the expected answer\.$/);
  if (match) return `${match[1]} de ${match[2]} respuestas no cumplieron la respuesta esperada.`;
  match = text.match(/^(\d+) (?:test was|tests were) flagged as unclear or with a questionable expected answer and excluded from the score until reviewed\.$/);
  if (match) return `${match[1]} ${match[1] === "1" ? "prueba se marcó como poco clara o con una respuesta esperada dudosa y se excluyó" : "pruebas se marcaron como poco claras o con una respuesta esperada dudosa y se excluyeron"} de la puntuación hasta su revisión.`;
  match = text.match(/^(\d+) (?:answer was|answers were) not captured reliably from the web app and excluded from the score\.$/);
  if (match) return `${match[1]} ${match[1] === "1" ? "respuesta no se capturó" : "respuestas no se capturaron"} de forma fiable desde la aplicación web y ${match[1] === "1" ? "se excluyó" : "se excluyeron"} de la puntuación.`;
  match = text.match(/^(\d+) (?:answer was|answers were) graded automatically by an AI answer judge that compares meaning, not wording, against the expected answer and your documentation\. Agreement with human review: (.+)\.$/);
  if (match) {
    const agreement = match[2] === "not yet measured" ? "aún sin medir" : match[2].replace(/ over (\d+) reviewed results?/, (_m, n: string) => ` en ${n} ${n === "1" ? "resultado revisado" : "resultados revisados"}`);
    return `${match[1]} ${match[1] === "1" ? "respuesta se calificó" : "respuestas se calificaron"} automáticamente con un juez de respuestas de IA que compara el significado, no la redacción, con la respuesta esperada y tu documentación. Concordancia con la revisión humana: ${agreement}.`;
  }
  match = text.match(/^(.+) failures$/);
  if (match) return `Fallos en ${match[1].replaceAll("_", " ")}`;
  return text;
}
