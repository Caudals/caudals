import { getLocale } from "./en";

/**
 * Spanish for fixed English labels that live in data tables rather than the
 * message catalogue (status badges, evaluation stages, chart legends,
 * connection kinds, severities). `tr` returns the label unchanged in English
 * or when no translation exists, so every label written as `tr("…")` or
 * `phrase("…")` needs an entry here: `npm run i18n:check-parity` fails
 * otherwise (launch L-23).
 */
const ES = {
  Pass: "Superada", Partial: "Parcial", Fail: "Fallida", "Not scored": "Sin puntuar",
  Running: "En curso", "Waiting for your answers": "Esperando tus respuestas", "Waiting for your runner": "Esperando a tu ejecutor",
  Paused: "En pausa", Failed: "Con error", "Results ready": "Resultados listos", Cancelled: "Cancelada", "Finalizing results": "Finalizando resultados",
  "Ready to run": "Lista para ejecutar", "Draft needs another try": "El borrador necesita otro intento", "Review test set": "Revisar conjunto de pruebas",
  "Needs your input": "Necesita tu respuesta", "Preparing tests": "Preparando pruebas", "Preparation failed": "La preparación ha fallado",
  "Add reference material": "Añadir material de referencia", "Connect a system": "Conectar un sistema", "Draft": "Borrador",
  "Generate the test set": "Generar el conjunto de pruebas",
  // The four steps of an evaluation's progress bar.
  Connect: "Conectar", "Prepare tests": "Preparar pruebas", Run: "Ejecutar", Results: "Resultados",
  // Stacked outcome bars: "2/6 not right".
  "not right": "con fallos",
  // Screen-reader state of a progress step.
  done: "completado", "in progress": "en curso", "needs attention": "requiere atención",
  // The operator console's "next step" column.
  "Waiting for reference material": "Esperando material de referencia", "Answer context questions": "Responder las preguntas de contexto",
  "Approve the test set": "Aprobar el conjunto de pruebas", "Start the run": "Iniciar la ejecución", "Resume or reduce scope": "Reanudar o reducir el alcance",
  "Score and publish the report": "Puntuar y publicar el informe", "Report published": "Informe publicado", "Inspect the failure": "Revisar el fallo",
  Ready: "Lista", "Needs review": "Requiere revisión", "Needs input": "Requiere respuesta", Validating: "Validando",
  "Checking connection": "Comprobando conexión", "Reading sources": "Leyendo fuentes", "Understanding system": "Analizando el sistema",
  "Waiting for answers": "Esperando respuestas", Queued: "En cola", Pausing: "Pausando", Cancelling: "Cancelando", Completed: "Completada",
  Answered: "Respondida", Pending: "Pendiente", "Checking plan": "Comprobando el plan", "Asking the system": "Preguntando al sistema",
  "Grading answers": "Calificando respuestas", "Computing results": "Calculando resultados", "Writing report": "Redactando informe", Done: "Hecho",
  Connected: "Conectado", Paired: "Emparejado", Healthy: "Operativo", Degraded: "Degradado", Unhealthy: "Con fallos",
  "Paused (circuit open)": "En pausa (circuito abierto)", "Not checked": "Sin comprobar", Retired: "Retirado", Enabled: "Activado",
  Disabled: "Desactivado", Revoked: "Revocado", "Token expired": "Token caducado", Unsupported: "No admitido", "Needs assistance": "Necesita ayuda",
  "System error": "Error del sistema", "Network error": "Error de red", "Timed out": "Tiempo agotado", "Capture incomplete": "Captura incompleta",
  "Needs attention": "Requiere atención", Checking: "Comprobando",
  "Unknown outcome": "Resultado desconocido", "Pairing required": "Emparejamiento pendiente", "Awaiting runner": "Esperando al ejecutor",
  "Website chatbot": "Chatbot web", "OpenAI-compatible API": "API compatible con OpenAI", "Provider API": "API del proveedor",
  "HTTPS JSON API": "API JSON HTTPS", "Uploaded answers": "Respuestas subidas", "Private runner": "Ejecutor privado",
  "Deployed system": "Sistema desplegado", "Controlled model": "Modelo controlado", Published: "Publicado", Superseded: "Sustituido",
  Withdrawn: "Retirado", Preliminary: "Preliminar", Reviewed: "Revisado", Complete: "Completo", Incomplete: "Incompleto", Unreviewed: "Sin revisar",
  Comparable: "Comparable", "Not comparable": "No comparable", Inconclusive: "No concluyente", Improved: "Mejorada", Regressed: "Empeorada",
  Unchanged: "Sin cambios", Regression: "Regresión", Unknown: "Desconocido", Critical: "Crítica", High: "Alta", Medium: "Media", Low: "Baja",
  Assigned: "Asignado", "In progress": "En curso", Active: "Activo", Quarantined: "En cuarentena", Released: "Publicado",
  Disputed: "Disputado", Approved: "Aprobado", Captured: "Capturado",
  // Expert review states (launch L-23: shown in the expert and ops screens).
  "Save conflict": "Conflicto al guardar", "Guideline changed": "Guía modificada", Submitted: "Enviado", "In review": "En revisión",
  "Changes requested": "Cambios solicitados", Rejected: "Rechazado", Adjudicated: "Resuelto", "Not required": "No necesario", Persisting: "Guardando", Extracting: "Extrayendo",
  Profiling: "Analizando", "Profile ready": "Perfil listo", Drafting: "Redactando", "Draft ready": "Borrador listo",
  Exploratory: "Exploratoria", "Source grounded": "Basada en fuentes", "Source-grounded": "Basada en fuentes", Expired: "Caducado",
  "Imported answers": "Respuestas importadas", Proposed: "Propuesta", Planned: "Planificada", Closed: "Cerrada",
  "Paused — add credits to continue": "En pausa: añade créditos para continuar", "Paused — spending cap reached": "En pausa: límite de gasto alcanzado",
  // Ops billing console (launch L-16): ledger entries, lots, states, flags and meters.
  "Purchase": "Compra",
  "Grant": "Concesión",
  "Allowance": "Asignación",
  "Bonus": "Bonificación",
  "Hold": "Retención",
  "Release": "Liberación",
  "Capture": "Captura",
  "Action": "Cargo de medidor",
  "Refund": "Devolución",
  "Adjustment": "Ajuste",
  "Expiry": "Caducidad",
  "Chargeback": "Contracargo",
  "Reversal": "Reversión",
  "Promo": "Promoción",
  "Contract allowance": "Asignación del contrato",
  "Free": "Gratuito",
  "Credits": "Créditos",
  "Contract": "Contrato",
  "Shadow": "Sombra",
  "Enforce": "Aplicar",
  "Adjust": "Ajuste",
  "Run refund": "Devolución de ejecución",
  "Money refund": "Reembolso de pago",
  "Executed": "Ejecutada",
  "Held": "Retenida",
  "Paid": "Pagado",
  "Refunded": "Reembolsado",
  "Refund pending": "Reembolso pendiente",
  "Charged back": "Contracargado",
  "Pending issue": "Pendiente de emisión",
  "Issued": "Emitida",
  "Voided": "Anulada",
  "Card country mismatch": "País de la tarjeta distinto",
  "Partial refund review": "Revisar reembolso parcial",
  "External refund": "Reembolso fuera de Caudals",
  "Refund shortfall": "Reembolso incompleto",
  "Chargeback shortfall": "Contracargo incompleto",
  "Many hosts": "Muchos sitios",
  "Shared domain": "Dominio compartido",
  "Many runs": "Muchas ejecuciones",
  "Website question": "Pregunta en web",
  "Api question": "Pregunta por API",
  "Imported answer": "Respuesta importada",
  "Web page read": "Página web leída",
  "Document page": "Página de documento",
  "Web search query": "Búsqueda web",
  "Question": "Pregunta",
  "Page": "Página",
  "Query": "Consulta",
  "Answer": "Respuesta",
  "Opening": "Saldo inicial",
  "Purchased": "Comprados",
  "Consumed": "Consumidos",
  "Returned": "Devueltos",
  "Adjusted": "Ajustados",
  "Closing": "Saldo final",
  "Receipt": "Recibo",
  "Auto recharge failed": "Recarga automática fallida",
  "Low balance": "Saldo bajo",
  "List price": "Precio de lista",
  "Internal estimate": "Estimación interna",
  "Model": "Modelo",
  "Meter": "Medidor",
  "Test": "Prueba",
  "Live": "Real",
  "Worker": "Proceso",
  "System": "Sistema",
  "User": "Persona",
} satisfies Record<string, string>;

/** A fixed English label with a Spanish entry in the table above. */
export type Phrase = keyof typeof ES;

export function tr(text: string): string {
  return getLocale() === "es" ? (ES as Record<string, string>)[text] ?? text : text;
}

/**
 * Marks a fixed label in a data table that is shown through `tr` later (for
 * example the status pills). It returns the label unchanged; the type only
 * accepts labels the Spanish table has.
 */
export function phrase<T extends Phrase>(text: T): T {
  return text;
}

/** Whether the Spanish table has this label (for the parity check). */
export function hasPhrase(text: string): boolean {
  return Object.hasOwn(ES, text);
}

/** Every fixed label with its Spanish, as [English, Spanish] (for the parity checks). */
export function phraseLabels(): Array<[string, string]> {
  return Object.entries(ES);
}

/** Curated server messages (API errors) that people commonly see, in Spanish. */
const SERVER_ES: Record<string, string> = {
  "Assign another owner before changing the last owner’s role.": "Asigna otro propietario antes de cambiar el rol del último.",
  "No model is set up for test generation. A Caudals administrator can choose one in Settings → AI models.": "No hay ningún modelo configurado para generar pruebas. Un administrador de Caudals puede elegirlo en Ajustes → Modelos de IA.",
  "A workspace generation budget must be configured before preparing this dataset.": "Hay que configurar un presupuesto de generación del espacio antes de preparar este conjunto.",
  "Set a positive evaluation budget before generating a dataset.": "Define un presupuesto de evaluación positivo antes de generar un conjunto.",
  "Answer each question in 1 to 2,000 characters.": "Responde cada pregunta con entre 1 y 2.000 caracteres.",
  "The free plan includes one AI system. Delete the current one or talk to us about a pilot.": "El plan gratuito incluye un sistema de IA. Borra el actual o habla con nosotros de un piloto.",
  "The free plan includes three runs a month. Talk to us about a pilot for more.": "El plan gratuito incluye tres ejecuciones al mes. Habla con nosotros de un piloto para hacer más.",
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
  "Could not list models from the demo provider. Check its connection and try again.": "No se han podido listar los modelos del proveedor de la demo. Revisa su conexión e inténtalo de nuevo.",
  "Choose an available model from the demo provider.": "Elige un modelo disponible en el proveedor de la demo.",
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
  // Prospect snapshots (launch L-21).
  "Today's snapshot limit is reached. Try again tomorrow (Madrid time).": "Se ha alcanzado el límite diario de pruebas externas. Vuelve a intentarlo mañana (hora de Madrid).",
  "This chat already has a snapshot from the last 24 hours.": "Este chat ya tiene una prueba externa de las últimas 24 horas.",
  "Snapshots use ordinary questions only. Adversarial or unlisted question packs are blocked.": "Las pruebas externas solo usan preguntas normales. Los paquetes adversarios o no incluidos en la lista están bloqueados.",
  "Use public https pages, without a login, port or private address.": "Usa páginas https públicas, sin inicio de sesión, puerto ni dirección privada.",
  "Say who gave permission and when.": "Indica quién dio el permiso y cuándo.",
  "Publish the snapshot's report before making its link.": "Publica el informe de la prueba antes de crear su enlace.",
  "Create the private link before the CRM draft.": "Crea el enlace privado antes del borrador para el CRM.",
  "This account has no published report yet.": "Esta cuenta aún no tiene un informe publicado.",
  "A prospect snapshot runs only ordinary questions on a website chat, within its traffic limits and question count.": "Una prueba externa solo hace preguntas normales a un chat web, dentro de sus límites de tráfico y de número de preguntas.",
  "The link could not be labelled as an external snapshot.": "No se ha podido etiquetar el enlace como prueba externa.",
  "Add your billing details before buying credits.": "Añade tus datos de facturación antes de comprar créditos.",
  "We could not confirm your VAT number with VIES yet. Save your billing details again in a few minutes, or write to hello@caudals.com.": "Aún no hemos podido confirmar tu número de IVA en VIES. Vuelve a guardar tus datos de facturación dentro de unos minutos o escríbenos a hello@caudals.com.",
  "Billing addresses in the Canary Islands, Ceuta and Melilla need a manual review. Write to hello@caudals.com.": "Las direcciones de facturación en Canarias, Ceuta y Melilla necesitan una revisión manual. Escríbenos a hello@caudals.com.",
  "New accounts can buy up to €100 of credits in their first 30 days. Write to hello@caudals.com to raise the limit.": "Las cuentas nuevas pueden comprar hasta 100 € en créditos durante sus primeros 30 días. Escríbenos a hello@caudals.com para ampliar el límite.",
  "New accounts can start up to 3 top-ups a day. Try again tomorrow.": "Las cuentas nuevas pueden iniciar hasta 3 recargas al día. Vuelve a intentarlo mañana.",
  "Payments are paused for this workspace. Write to hello@caudals.com.": "Los pagos están en pausa en este espacio de trabajo. Escríbenos a hello@caudals.com.",
  "This request was already used for a different top-up. Start again.": "Esta petición ya se usó para otra recarga. Empieza de nuevo.",
  "This checkout has ended. Start a new top-up.": "Este pago ha terminado. Empieza una nueva recarga.",
  "Check the tax ID: a Spanish NIF, an EU VAT number or your company's tax registration number.": "Revisa la identificación fiscal: un NIF español, un número de IVA de la UE o el número de registro fiscal de tu empresa.",
  "Choose the country of your billing address.": "Elige el país de tu dirección de facturación.",
  "Buy credits once with a card first. Auto-recharge uses the card saved at that purchase.": "Compra créditos una vez con tarjeta primero. La recarga automática usa la tarjeta guardada en esa compra.",
  "Only an unused purchase can be refunded, within 14 days of payment.": "Solo se puede reembolsar una compra sin usar, en los 14 días siguientes al pago.",
  "Payments are temporarily unavailable. Nothing was charged. Try again in a few minutes.": "Los pagos no están disponibles en este momento. No se ha cobrado nada. Vuelve a intentarlo dentro de unos minutos.",
  "Payments are temporarily unavailable. Try again in a few minutes.": "Los pagos no están disponibles en este momento. Vuelve a intentarlo dentro de unos minutos.",
  "The monthly limit must cover at least one recharge.": "El límite mensual debe cubrir al menos una recarga.",
  // Better document intake (launch L-34).
  "Use a path such as /help, without a query or spaces.": "Usa una ruta como /help, sin parámetros ni espacios.",
  "The sitemap must be on the same website as the help centre.": "El sitemap debe estar en el mismo sitio web que el centro de ayuda.",
  "The page list is not ready yet.": "La lista de páginas aún no está lista.",
  "Choose at least one page.": "Elige al menos una página.",
  "Choose pages from the list.": "Elige páginas de la lista.",
  "This context has already been confirmed or skipped.": "Este contexto ya se ha confirmado u omitido.",
  "Enter the reference date as a date such as 2026-10-01.": "Escribe la fecha de referencia como una fecha, por ejemplo 2026-10-01.",
  "Enter languages such as English, Spanish or es-ES.": "Escribe idiomas como español, inglés o es-ES.",
  "Choose one of this test set's sources.": "Elige una de las fuentes de este conjunto de pruebas.",
  "Check the corrected fields and try again.": "Revisa los campos corregidos y vuelve a intentarlo.",
  "Choose between one and sixty source revisions.": "Elige entre una y sesenta fuentes.",
  // Ops billing console (launch L-16).
  "Above 10,000 credits (€100) a second platform administrator must approve this action.": "Por encima de 10.000 créditos (100 €), un segundo administrador de la plataforma debe aprobar esta acción.",
  "A different platform administrator must approve this request.": "Otro administrador de la plataforma debe aprobar esta solicitud.",
  "Approval request not found.": "No se encuentra la solicitud de aprobación.",
  "The request is not the one you reviewed. Reload it and review it again.": "La solicitud no es la que revisaste. Vuelve a cargarla y revísala de nuevo.",
  "This request is no longer waiting for approval.": "Esta solicitud ya no está pendiente de aprobación.",
  "This request expired after 24 hours without a second approval. Ask for a new one.": "Esta solicitud caducó a las 24 horas sin una segunda aprobación. Pide una nueva.",
  "This action is within the single-administrator limit. Run it directly.": "Esta acción está dentro del límite de un solo administrador. Ejecútala directamente.",
  "A payment dispute is open. The account stays frozen until Stripe closes it.": "Hay una disputa de pago abierta. La cuenta sigue congelada hasta que Stripe la cierre.",
  "Credit lot not found.": "No se encuentra el lote de créditos.",
  "Only lots with credits left that have not expired yet can be extended.": "Solo se pueden ampliar los lotes con créditos que aún no han caducado.",
  "There are not enough unheld credits for this correction.": "No hay suficientes créditos sin retener para esta corrección.",
  "This account is frozen.": "Esta cuenta está congelada.",
  "This workspace has no credit account.": "Este espacio de trabajo no tiene cuenta de créditos.",
  "Ledger entry not found.": "No se encuentra el movimiento.",
  "This entry cannot be reversed.": "Este movimiento no se puede revertir.",
  "This entry was already reversed or refunded.": "Este movimiento ya se revirtió o se devolvió.",
  "Its credits were already used or are held. Correct what is left with an adjustment.": "Sus créditos ya se usaron o están retenidos. Corrige lo que quede con un ajuste.",
  "This run has no charges left to refund.": "Esta ejecución no tiene cargos pendientes de devolver.",
  "This request key was already used for a different action. Start again.": "Esta clave de petición ya se usó para otra acción. Empieza de nuevo.",
  "Give a reason of 3 to 2,000 characters.": "Indica un motivo de 3 a 2.000 caracteres.",
  "Order not found.": "No se encuentra el pedido.",
  "This order was not paid.": "Este pedido no se pagó.",
  "The credits were removed but Stripe has not confirmed the refund yet. Try again in a few minutes.": "Los créditos se han retirado, pero Stripe aún no ha confirmado el reembolso. Vuelve a intentarlo dentro de unos minutos.",
  "This revision raises prices and its notice did not go out 30 days before its date, so it cannot take effect. Cancel it and schedule it again with 30 days' notice.": "Esta revisión sube precios y su aviso no salió 30 días antes de su fecha, así que no puede entrar en vigor. Cancélala y vuelve a programarla con 30 días de aviso.",
  "The notice deadline (30 days before the date) has passed. Cancel the revision and schedule it at least 30 days after today.": "El plazo del aviso (30 días antes de la fecha) ha pasado. Cancela la revisión y prográmala al menos 30 días después de hoy.",
  "This revision raises no rate: decreases apply without notice.": "Esta revisión no sube ninguna tarifa: las bajadas se aplican sin aviso.",
  "Owner notices are off in this environment (BILLING_PRICE_NOTICES=internal). Send a test to the internal address instead.": "Los avisos a propietarios están desactivados en este entorno (BILLING_PRICE_NOTICES=internal). Envía una prueba a la dirección interna.",
  "The notice deadline has passed. Cancel the revision and schedule it at least 30 days after today.": "El plazo del aviso ha pasado. Cancela la revisión y prográmala al menos 30 días después de hoy.",
  "Schedule the revision first: the notice names its date.": "Programa primero la revisión: el aviso indica su fecha.",
  "The internal notification address is not configured.": "La dirección interna de avisos no está configurada.",
  "Choose today or an earlier day.": "Elige hoy o un día anterior.",
  "Use a month as YYYY-MM.": "Indica el mes como AAAA-MM.",
  "That file is part of the export only when Stripe is reconciled.": "Ese archivo solo forma parte de la exportación cuando se concilia con Stripe.",
  "Only a positive adjustment has an expiry.": "Solo un ajuste positivo tiene caducidad.",
  // Data controls (launch L-32).
  "Only a workspace owner can change how long answers are kept.": "Solo un propietario del espacio puede cambiar cuánto tiempo se conservan las respuestas.",
  "Choose 30, 90 or 365 days, or keep answers until you delete them.": "Elige 30, 90 o 365 días, o conserva las respuestas hasta que las elimines.",
  "This run's answers were removed under the workspace's retention setting, so it can't be graded or reported again.": "Las respuestas de esta prueba se eliminaron por el ajuste de conservación del espacio, así que no se puede volver a calificar ni a informar.",
  "Only a workspace owner can export workspace data.": "Solo un propietario del espacio puede exportar sus datos.",
  "This workspace is being deleted, so its data can no longer be exported.": "Este espacio se está eliminando, así que ya no se pueden exportar sus datos.",
  "The export is being prepared. Delete it once it is ready.": "La exportación se está preparando. Elimínala cuando esté lista.",
  "This export is no longer available. Prepare a new one.": "Esta exportación ya no está disponible. Prepara una nueva.",
  "Only Caudals operations can attach a countersigned copy.": "Solo el equipo de operaciones de Caudals puede adjuntar una copia firmada.",
  "Only Caudals operations can remove a countersigned copy.": "Solo el equipo de operaciones de Caudals puede quitar una copia firmada.",
  "Attach a PDF of up to 10 MB.": "Adjunta un PDF de hasta 10 MB.",
  "Attach a PDF.": "Adjunta un PDF.",
  "The file is not a PDF.": "El archivo no es un PDF.",
  "That DPA acceptance does not belong to this workspace.": "Esa aceptación del contrato no pertenece a este espacio.",
  "A countersigned copy is already attached. Remove it first.": "Ya hay una copia firmada adjunta. Quítala primero.",
};

/** Translate a curated server sentence; evaluation- or model-specific details keep their wording. */
export function trServer(message: string): string {
  if (getLocale() !== "es") return message;
  if (SERVER_ES[message]) return SERVER_ES[message];
  const pages = message.match(/^Choose at most (\d+) pages\.$/);
  if (pages) return `Elige como máximo ${pages[1]} páginas.`;
  const inUse = message.match(/^The evaluation “(.+)” (tests this system|uses this test set)\. Delete that evaluation first\.$/);
  if (inUse) return `La evaluación «${inUse[1]}» ${inUse[2] === "tests this system" ? "prueba este sistema" : "usa este conjunto de pruebas"}. Elimina antes esa evaluación.`;
  return message;
}
