import { getLocale } from "./en";

/**
 * Spanish for fixed English labels that live in data tables rather than the
 * message catalogue (status badges, evaluation stages, chart legends,
 * connection kinds, severities). `tr` returns the label unchanged in English
 * or when no translation exists.
 */
const ES: Record<string, string> = {
  Pass: "Superada", Partial: "Parcial", Fail: "Fallida", "Not scored": "Sin puntuar",
  Running: "En curso", "Waiting for your answers": "Esperando tus respuestas", "Waiting for your runner": "Esperando a tu ejecutor",
  Paused: "En pausa", Failed: "Con error", "Results ready": "Resultados listos", Cancelled: "Cancelada", "Finalizing results": "Finalizando resultados",
  "Ready to run": "Lista para ejecutar", "Draft needs another try": "El borrador necesita otro intento", "Review test set": "Revisar conjunto de pruebas",
  "Needs your input": "Necesita tu respuesta", "Preparing tests": "Preparando pruebas", "Preparation failed": "La preparación ha fallado",
  "Add reference material": "Añadir material de referencia", "Connect a system": "Conectar un sistema", "Draft": "Borrador",
  Ready: "Lista", "Needs review": "Requiere revisión", "Needs input": "Requiere respuesta", Validating: "Validando",
  "Checking connection": "Comprobando conexión", "Reading sources": "Leyendo fuentes", "Understanding system": "Analizando el sistema",
  "Waiting for answers": "Esperando respuestas", Queued: "En cola", Pausing: "Pausando", Cancelling: "Cancelando", Completed: "Completada",
  Answered: "Respondida", Pending: "Pendiente", "Checking plan": "Comprobando el plan", "Asking the system": "Preguntando al sistema",
  "Grading answers": "Calificando respuestas", "Computing results": "Calculando resultados", "Writing report": "Redactando informe", Done: "Hecho",
  Connected: "Conectado", Paired: "Emparejado", Healthy: "Operativo", Degraded: "Degradado", Unhealthy: "Con fallos",
  "Paused (circuit open)": "En pausa (circuito abierto)", "Not checked": "Sin comprobar", Retired: "Retirado", Enabled: "Activado",
  Disabled: "Desactivado", Revoked: "Revocado", "Token expired": "Token caducado", Unsupported: "No admitido", "Needs assistance": "Necesita ayuda",
  "System error": "Error del sistema", "Network error": "Error de red", "Timed out": "Tiempo agotado", "Capture incomplete": "Captura incompleta",
  "Unknown outcome": "Resultado desconocido", "Pairing required": "Emparejamiento pendiente", "Awaiting runner": "Esperando al ejecutor",
  "Website chatbot": "Chatbot web", "OpenAI-compatible API": "API compatible con OpenAI", "Provider API": "API del proveedor",
  "HTTPS JSON API": "API JSON HTTPS", "Uploaded answers": "Respuestas subidas", "Private runner": "Ejecutor privado",
  "Deployed system": "Sistema desplegado", "Controlled model": "Modelo controlado", Published: "Publicado", Superseded: "Sustituido",
  Withdrawn: "Retirado", Preliminary: "Preliminar", Reviewed: "Revisado", Complete: "Completo", Incomplete: "Incompleto", Unreviewed: "Sin revisar",
  Comparable: "Comparable", "Not comparable": "No comparable", Inconclusive: "No concluyente", Improved: "Mejorada", Regressed: "Empeorada",
  Unchanged: "Sin cambios", Regression: "Regresión", Critical: "Crítica", High: "Alta", Medium: "Media", Low: "Baja",
  Assigned: "Asignado", "In progress": "En curso", Active: "Activo", Quarantined: "En cuarentena", Released: "Publicado",
  Disputed: "Disputado", Approved: "Aprobado", Captured: "Capturado", Persisting: "Guardando", Extracting: "Extrayendo",
  Profiling: "Analizando", "Profile ready": "Perfil listo", Drafting: "Redactando", "Draft ready": "Borrador listo",
  Exploratory: "Exploratoria", "Source grounded": "Basada en fuentes", "Source-grounded": "Basada en fuentes", Expired: "Caducado",
  "Imported answers": "Respuestas importadas", Proposed: "Propuesta", Planned: "Planificada", Closed: "Cerrada",
};

export function tr(text: string): string {
  return getLocale() === "es" ? ES[text] ?? text : text;
}

/** Curated server messages (API errors) that people commonly see, in Spanish. */
const SERVER_ES: Record<string, string> = {
  "No model is set up for test generation. A Caudals administrator can choose one in Settings → AI models.": "No hay ningún modelo configurado para generar pruebas. Un administrador de Caudals puede elegirlo en Ajustes → Modelos de IA.",
  "A workspace generation budget must be configured before preparing this dataset.": "Hay que configurar un presupuesto de generación del espacio antes de preparar este conjunto.",
  "Set a positive evaluation budget before generating a dataset.": "Define un presupuesto de evaluación positivo antes de generar un conjunto.",
  "Answer each question in 1 to 2,000 characters.": "Responde cada pregunta con entre 1 y 2.000 caracteres.",
  "The free plan includes one AI system. Delete the current one or talk to us about a pilot.": "El plan gratis incluye un sistema de IA. Borra el actual o habla con nosotros de un piloto.",
  "The free plan includes three runs a month. Talk to us about a pilot for more.": "El plan gratis incluye tres ejecuciones al mes. Habla con nosotros de un piloto para hacer más.",
  "Enter the effective date as YYYY-MM-DD. A year such as 2027 or a month such as 2027-03 also works.": "Escribe la fecha de vigencia como AAAA-MM-DD. También vale un año, como 2027, o un mes, como 2027-03.",
  "Enter language tags such as en or es-ES, separated by commas.": "Escribe códigos de idioma como en o es-ES, separados por comas.",
  "That answer no longer matches an open question. Reload the page and answer again.": "Esa respuesta ya no corresponde a una pregunta abierta. Recarga la página y vuelve a responder.",
  "The selected material does not fit the model's context window. Choose fewer sources or a model with a larger context in Settings → AI models.": "El material seleccionado no cabe en la ventana de contexto del modelo. Elige menos fuentes o un modelo con más contexto en Ajustes → Modelos de IA.",
  "The selected model's context window is too small for this material. Choose a model with a larger context in Settings → AI models.": "La ventana de contexto del modelo seleccionado es demasiado pequeña para este material. Elige un modelo con más contexto en Ajustes → Modelos de IA.",
  "This evaluation is running. Cancel the run first, then delete it.": "Esta evaluación está en curso. Cancela primero la ejecución y después elimínala.",
  "This version is frozen. Make an editable copy first.": "Esta versión está congelada. Haz primero una copia editable.",
  "A test set needs at least one question.": "Un conjunto de pruebas necesita al menos una pregunta.",
  "Questions can only be added to single-question test sets.": "Solo se pueden añadir preguntas a conjuntos de una pregunta por prueba.",
  "Sign in to continue.": "Inicia sesión para continuar.",
  "A platform administrator is required.": "Se necesita un administrador de la plataforma.",
  "Sign in again to confirm this platform change.": "Vuelve a iniciar sesión para confirmar este cambio de la plataforma.",
  "Could not list models from this provider. Check the address and key, then try again.": "No se han podido listar los modelos de este proveedor. Revisa la dirección y la clave e inténtalo de nuevo.",
  "That address does not resolve to a public HTTPS API.": "Esa dirección no corresponde a una API HTTPS pública.",
  "Use the provider's HTTPS API base address, for example https://api.openai.com/v1.": "Usa la dirección base HTTPS de la API del proveedor, por ejemplo https://api.openai.com/v1.",
  "The DGX Spark is not connected in this environment.": "El DGX Spark no está conectado en este entorno.",
  "The provider rejected the key.": "El proveedor ha rechazado la clave.",
  "Secret storage is not configured.": "El almacén de secretos no está configurado.",
  "JSON is required.": "Se requiere JSON.",
  "Request is too large.": "La petición es demasiado grande.",
  "Idempotency-Key required.": "Falta la cabecera Idempotency-Key.",
  "Add a first question by generating or importing a test set.": "Añade una primera pregunta generando o importando un conjunto de pruebas.",
  "Question not found in this draft.": "La pregunta no está en este borrador.",
};

/** Translate a curated server sentence; evaluation- or model-specific details keep their wording. */
export function trServer(message: string): string {
  if (getLocale() !== "es") return message;
  if (SERVER_ES[message]) return SERVER_ES[message];
  const inUse = message.match(/^The evaluation “(.+)” (tests this system|uses this test set)\. Delete that evaluation first\.$/);
  if (inUse) return `La evaluación «${inUse[1]}» ${inUse[2] === "tests this system" ? "prueba este sistema" : "usa este conjunto de pruebas"}. Elimina antes esa evaluación.`;
  return message;
}
