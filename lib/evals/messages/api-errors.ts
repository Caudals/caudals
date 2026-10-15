import { getLocale } from "./runtime";
import { serverPhrase } from "./phrases";

/**
 * The API's error messages in the reader's language (launch L-23b, spec P-45).
 *
 * The API answers `{ error: { code, message } }` with a stable code and an
 * English sentence; both stay as they are for integrators. The app shows the
 * sentence in Spanish from {@link API_MESSAGES_ES} (or the older table in
 * `phrases.ts`), a sentence with run-time parts through {@link API_PATTERNS_ES},
 * and anything else through its code ({@link API_CODES}) or, for a code it
 * does not know, a generic message plus the code — never English prose.
 *
 * `scripts/i18n/api-errors.ts` lists every code and sentence the server can
 * send; `npm run i18n:check-parity` and `tests/i18n/api-errors.test.ts` fail
 * when one has no entry here.
 */

/** Spanish for each fixed English sentence the API sends, keyed by the sentence. */
export const API_MESSAGES_ES: Record<string, string> = {
  // Remote browser (web app connector).
  "Remote browser sessions are not configured.": "Las sesiones de navegador remoto no están configuradas.",
  "The remote browser is unavailable. Try reopening the live browser shortly.": "El navegador remoto no está disponible. Vuelve a abrir el navegador en vivo dentro de un momento.",
  "The remote browser is unavailable.": "El navegador remoto no está disponible.",
  "This remote browser session has expired. Reopen the live browser and sign in again.": "Esta sesión del navegador remoto ha caducado. Vuelve a abrir el navegador en vivo e inicia sesión de nuevo.",
  "The remote browser is in use. Close the other session or try again shortly.": "El navegador remoto está en uso. Cierra la otra sesión o vuelve a intentarlo dentro de un momento.",
  "The browser is busy. Wait for the current action to finish.": "El navegador está ocupado. Espera a que termine la acción en curso.",
  "Choose Take control to interact with this browser.": "Elige Tomar el control para interactuar con este navegador.",
  "Choose an element to teach, then select it in the browser.": "Elige el elemento que quieres enseñar y selecciónalo en el navegador.",
  "This element has no unique stable locator. Select its button, input or response wrapper, or ask the app owner to add data-testid.": "Este elemento no tiene un localizador estable y único. Selecciona su botón, su campo o el contenedor de la respuesta, o pide al responsable de la aplicación que añada data-testid.",
  "The selected element is unavailable. Reopen the live browser to repair it.": "El elemento seleccionado no está disponible. Vuelve a abrir el navegador en vivo para repararlo.",
  "Select the prompt input and assistant response before saving.": "Selecciona el campo del mensaje y la respuesta del asistente antes de guardar.",
  "Select a send button that disables during streaming, or teach a loading indicator while it is visible.": "Selecciona un botón de enviar que se desactive mientras llega la respuesta, o enseña un indicador de carga mientras está visible.",
  "The page or selected element timed out. Sign in again or repair the connector in the live browser.": "La página o el elemento seleccionado tardó demasiado. Vuelve a iniciar sesión o repara el conector en el navegador en vivo.",
  "The response did not finish. Teach the app's loading indicator or a send button that disables during streaming, then test again.": "La respuesta no terminó. Enseña el indicador de carga de la aplicación o un botón de enviar que se desactive mientras llega la respuesta y vuelve a probar.",
  "The website reports that its interaction or credit limit has been reached. Try again when that website allows more messages.": "El sitio web indica que ha alcanzado su límite de interacciones o de créditos. Vuelve a intentarlo cuando ese sitio permita más mensajes.",
  "The connection could not capture complete replies after a fresh-session reset. Repair the response or completion element in the live browser.": "La conexión no ha podido capturar respuestas completas después de reiniciar la sesión. Repara el elemento de respuesta o de finalización en el navegador en vivo.",
  "The app is asking you to sign in. Use the live browser to sign in, then run Connect system again.": "La aplicación te pide iniciar sesión. Inicia sesión en el navegador en vivo y vuelve a seleccionar Conectar sistema.",
  "Return to the configured app before teaching or saving its connector.": "Vuelve a la aplicación configurada antes de enseñar o guardar su conector.",
  "The saved login is unavailable. Reopen the live browser and sign in again.": "La sesión guardada no está disponible. Vuelve a abrir el navegador en vivo e inicia sesión de nuevo.",
  "No chat box was found on this page. Open the chatbot in the live browser, then run Connect system again.": "No se ha encontrado ningún chat en esta página. Abre el chatbot en el navegador en vivo y vuelve a seleccionar Conectar sistema.",
  "Caudals could not find how to open the chat on a fresh page load. Use Fix next to Open or start a chat and click the button that opens it.": "Caudals no ha encontrado cómo abrir el chat al cargar de nuevo la página. Usa Corregir junto a Abrir o iniciar un chat y haz clic en el botón que lo abre.",
  "The chat launcher was not found on a fresh page load. Repair it in the live browser.": "No se ha encontrado el botón que abre el chat al cargar de nuevo la página. Repáralo en el navegador en vivo.",
  "The app did not start a new conversation. Use Fix next to Open or start a chat and select New chat or New conversation, then test again.": "La aplicación no inició una conversación nueva. Usa Corregir junto a Abrir o iniciar un chat y selecciona Nuevo chat o Nueva conversación; después, prueba de nuevo.",
  "Caudals could not identify the assistant's reply. Use Fix next to Reply and click the assistant's answer.": "Caudals no ha podido identificar la respuesta del asistente. Usa Corregir junto a Respuesta y haz clic en la respuesta del asistente.",
  "The message was not sent. Use Fix next to Send button and click the app's Send button.": "El mensaje no se envió. Usa Corregir junto a Botón de enviar y haz clic en el botón de enviar de la aplicación.",
  "Stopped.": "Detenido.",
  "The app's saved login data is too large to store securely.": "Los datos de la sesión guardada de la aplicación son demasiado grandes para guardarlos de forma segura.",
  "This remote browser belongs to another session. Reopen the live browser.": "Este navegador remoto pertenece a otra sesión. Vuelve a abrir el navegador en vivo.",
  "The browser could not complete this action. Reopen the live browser to sign in or repair the connector.": "El navegador no ha podido completar esta acción. Vuelve a abrir el navegador en vivo para iniciar sesión o reparar el conector.",

  // Plan limits (the app also opens its own upgrade dialog for PLAN_LIMIT_*).
  "This workspace has reached its plan's number of AI systems.": "Este espacio de trabajo ha alcanzado el número de sistemas de IA de su plan.",
  "This workspace has used its plan's runs for this month.": "Este espacio de trabajo ha agotado las ejecuciones de su plan este mes.",
  "This test set is larger than the workspace's plan allows.": "Este conjunto de pruebas es más grande de lo que permite el plan del espacio de trabajo.",
  "This connection type is not included in the workspace's plan.": "Este tipo de conexión no está incluido en el plan del espacio de trabajo.",
  "Scheduled monitoring is not included in the workspace's plan.": "La monitorización programada no está incluida en el plan del espacio de trabajo.",
  "This workspace has reached its plan's number of members.": "Este espacio de trabajo ha alcanzado el número de miembros de su plan.",
  "This workspace has reached its plan's number of members. Talk to us about a managed plan for more.": "Este espacio de trabajo ha alcanzado el número de miembros de su plan. Habla con nosotros sobre un plan gestionado para tener más.",

  // Envelope, sessions and access.
  "Enter languages such as English, Spanish or es-ES, separated by commas.": "Escribe idiomas como español, inglés o es-ES, separados por comas.",
  "Expert work is not available.": "El trabajo de expertos no está disponible.",
  "This surface is not available.": "Esta sección no está disponible.",
  "This action is not available.": "Esta acción no está disponible.",
  "Check the supplied fields.": "Revisa los datos introducidos.",
  "This workspace has no billing details.": "Este espacio de trabajo no tiene datos de facturación.",
  // Provider-price acknowledgements and manual tax reviews (launch G2).
  "Price check not found.": "No se encuentra el control de precios.",
  "A newer price check exists. Review that one instead.": "Hay un control de precios más reciente. Revisa ese.",
  "This price check found nothing that needs a decision.": "Este control de precios no encontró nada que requiera una decisión.",
  "These billing details no longer wait for a review.": "Estos datos de facturación ya no están pendientes de revisión.",
  "The billing details changed after you opened them. Reload and review them again.": "Los datos de facturación cambiaron después de abrirlos. Vuelve a cargarlos y revísalos de nuevo.",
  "That treatment does not apply to this review. A reverse charge needs the VIES consultation number.": "Ese tratamiento no corresponde a esta revisión. La inversión del sujeto pasivo necesita el número de consulta de VIES.",
  "The service is temporarily unavailable.": "El servicio no está disponible en este momento.",
  "Supply bounded, valid UTF-8 JSON without duplicate fields.": "Envía un JSON UTF-8 válido, de tamaño limitado y sin campos duplicados.",
  "Turn on two-factor authentication to continue.": "Activa la verificación en dos pasos para continuar.",
  "Confirm it is you to continue.": "Confirma que eres tú para continuar.",
  "Not found.": "No se encuentra.",

  // Expert review orders (launch L-26) and expert work.
  "This request or order has moved on. Reload to see its current state.": "Esta solicitud o pedido ha avanzado. Recarga la página para ver su estado actual.",
  "Every expert needs a complete onboarding checklist before order work.": "Cada experto necesita completar su lista de incorporación antes de trabajar en un pedido.",
  "No expert has submitted work on this order yet.": "Ningún experto ha entregado todavía trabajo en este pedido.",
  "Publish the report before asking for a review.": "Publica el informe antes de pedir una revisión.",
  "Choose at least one result from the current report.": "Elige al menos un resultado del informe actual.",
  "Every chosen result must be in the current report.": "Todos los resultados elegidos deben estar en el informe actual.",
  "This order is already closed.": "Este pedido ya está cerrado.",
  "The report has no published revision.": "El informe no tiene ninguna versión publicada.",
  "Assigned work was not found.": "No se encuentra el trabajo asignado.",
  "Project was not found.": "No se encuentra el proyecto.",
  "Submission revision was not found.": "No se encuentra la versión de la entrega.",
  "The superseded guideline does not belong to this project.": "La guía sustituida no pertenece a este proyecto.",
  "The selected expert is not eligible for assignment.": "El experto seleccionado no puede recibir asignaciones.",
  "The guideline does not belong to this project.": "La guía no pertenece a este proyecto.",
  "Review work requires a submitted revision from this project.": "La revisión necesita una entrega enviada de este proyecto.",
  "Independent review requires a different reviewer.": "La revisión independiente necesita un revisor distinto.",
  "This assignment is no longer editable.": "Esta asignación ya no se puede editar.",
  "Resolve the conflict declaration before working.": "Resuelve la declaración de conflicto de intereses antes de trabajar.",
  "This assignment no longer has a save conflict.": "Esta asignación ya no tiene un conflicto al guardar.",

  // Improvement datasets (Stage E).
  "Improvement record was not found.": "No se encuentra el registro de mejora.",
  "Dataset artifact was not found.": "No se encuentra el archivo del conjunto de datos.",
  "Released dataset was not found.": "No se encuentra el conjunto de datos publicado.",
  "Finding, assignment and batch must belong to one project.": "El hallazgo, la asignación y el lote deben pertenecer al mismo proyecto.",
  "Only an independently approved submission can be promoted.": "Solo se puede promover una entrega aprobada por un revisor independiente.",
  "Choose a verified reviewer with accepted terms.": "Elige un revisor verificado que haya aceptado las condiciones.",
  "Dataset QA requires a different reviewer.": "El control de calidad del conjunto de datos necesita un revisor distinto.",
  "The improvement batch changed.": "El lote de mejora ha cambiado.",
  "Add at least one reviewed item before release.": "Añade al menos un elemento revisado antes de publicar.",
  "review_required: every released item requires independent approval, permitted rights and approved redaction.": "review_required: cada elemento publicado necesita aprobación independiente, derechos permitidos y anonimización aprobada.",
  "Follow-up validation requires a compatible comparison.": "La validación de seguimiento necesita una comparación compatible.",
  "Follow-up validation requires at least one matched, scorable held-out case.": "La validación de seguimiento necesita al menos un caso reservado, emparejado y puntuable.",

  // CI trigger, tokens and destinations (launch L-19, L-20).
  "No evaluation has this test set version approved.": "Ninguna evaluación tiene aprobada esta versión del conjunto de pruebas.",
  "Several evaluations use this test set version. Send evaluationId too.": "Varias evaluaciones usan esta versión del conjunto de pruebas. Envía también evaluationId.",
  "Send an Idempotency-Key header of 8 to 200 visible characters, the same on every retry.": "Envía una cabecera Idempotency-Key de 8 a 200 caracteres visibles, la misma en cada reintento.",
  "This Idempotency-Key was used for another request. Use a new key for a new run.": "Esta Idempotency-Key ya se usó en otra petición. Usa una clave nueva para una ejecución nueva.",
  "System version not found.": "No se encuentra la versión del sistema.",
  "Runs on collected answers start in the app, where the answers are uploaded.": "Las ejecuciones con respuestas recopiladas se inician en la aplicación, donde se suben las respuestas.",
  "Run not found.": "No se encuentra la ejecución.",
  "Use a reviewed, published report revision.": "Usa una versión del informe revisada y publicada.",
  "Pass thresholds are not available yet.": "Los umbrales de aprobado aún no están disponibles.",
  "Only a workspace owner can set a schedule's credit limit.": "Solo un propietario del espacio de trabajo puede fijar el límite de créditos de una programación.",
  "That credit limit cannot be saved for this schedule.": "Ese límite de créditos no se puede guardar para esta programación.",
  "Credit limits apply to workspaces that pay with credits.": "Los límites de créditos se aplican a los espacios de trabajo que pagan con créditos.",
  "Choose a weekly or monthly schedule.": "Elige una programación semanal o mensual.",
  "Scheduled monitoring is not enabled for this workspace.": "La monitorización programada no está activada en este espacio de trabajo.",
  "The schedule must fit the agreed run and monthly spending limits.": "La programación debe ajustarse a los límites acordados por ejecución y de gasto mensual.",
  "The schedule changed. Reload it before saving.": "La programación ha cambiado. Vuelve a cargarla antes de guardar.",
  "Approve the test set before updating this schedule.": "Aprueba el conjunto de pruebas antes de actualizar esta programación.",
  "The updated schedule exceeds the agreed spending limits.": "La programación actualizada supera los límites de gasto acordados.",
  "This scope is not available.": "Este permiso no está disponible.",
  "Choose an expiry from five minutes to one year.": "Elige una caducidad de entre cinco minutos y un año.",
  "A customer API token is required.": "Se necesita un token de la API de clientes.",
  "Token scope or validity is insufficient.": "Los permisos o la validez del token no son suficientes.",
  "Paste the incoming webhook URL from Slack (https://hooks.slack.com/services/…).": "Pega la URL del webhook entrante de Slack (https://hooks.slack.com/services/…).",
  "Paste the incoming webhook URL from Microsoft Teams.": "Pega la URL del webhook entrante de Microsoft Teams.",
  "Use a team member's address or an address on your team's company domain.": "Usa la dirección de un miembro del equipo o una dirección del dominio de tu empresa.",
  "This destination type is not available yet.": "Este tipo de destino aún no está disponible.",
  "Use a public HTTPS address.": "Usa una dirección HTTPS pública.",
  "That address does not resolve to a public internet host. Private, loopback and link-local addresses are refused.": "Esa dirección no apunta a un servidor público de internet. Se rechazan las direcciones privadas, de bucle local y de enlace local.",
  "Only signed webhooks have a signing secret.": "Solo los webhooks firmados tienen un secreto de firma.",
  "Signed webhooks receive real events only.": "Los webhooks firmados solo reciben eventos reales.",

  // Partners (launch L-28).
  "No verified Caudals account uses that address. Ask the person to sign up or accept an invitation first.": "Ninguna cuenta verificada de Caudals usa esa dirección. Pide a la persona que se registre o acepte antes una invitación.",
  "That person is not in this partner account.": "Esa persona no está en esta cuenta de partner.",
  "This partner account is suspended or closed.": "Esta cuenta de partner está suspendida o cerrada.",
  "This partner account is closed.": "Esta cuenta de partner está cerrada.",
  "This partner account has reached its number of client workspaces. Ask Caudals to raise it.": "Esta cuenta de partner ha alcanzado su número de espacios de trabajo de clientes. Pide a Caudals que lo amplíe.",
  "That workspace is already managed by a partner.": "Ese espacio de trabajo ya lo gestiona un partner.",
  "The client workspace would have no owner of its own. Add an owner from the client, or delete the workspace first.": "El espacio de trabajo del cliente se quedaría sin propietario propio. Añade un propietario del cliente o elimina antes el espacio de trabajo.",
  "Some client workspaces have no owner of their own. Give each an owner or delete it before closing the partner.": "Algunos espacios de trabajo de clientes no tienen propietario propio. Asigna un propietario a cada uno o elimínalo antes de cerrar el partner.",
  "The partner needs another admin first: its client workspaces have no owner of their own.": "El partner necesita antes otro administrador: sus espacios de trabajo de clientes no tienen propietario propio.",
  "A partner can have 20 active referral codes. Revoke one first.": "Un partner puede tener 20 códigos de referido activos. Revoca uno antes.",
  "The partner has no allowance in effect today.": "El partner no tiene ninguna asignación en vigor hoy.",
  "That grant would exceed this month's partner allowance.": "Esa concesión superaría la asignación del partner de este mes.",
  "This request key was already used for different data.": "Esta clave de petición ya se usó con otros datos.",
  // Partner accounts and logos (launch L-28), continued.
  "The client's credit account is frozen.": "La cuenta de créditos del cliente está congelada.",
  "Choose a month as YYYY-MM.": "Elige un mes con el formato AAAA-MM.",
  "Provide an Idempotency-Key of 8–120 letters, digits, dots, colons, dashes or underscores.": "Envía una Idempotency-Key de 8 a 120 letras, cifras, puntos, dos puntos, guiones o guiones bajos.",
  "Provide an Idempotency-Key of 8–160 characters.": "Envía una Idempotency-Key de 8 a 160 caracteres.",
  "Send the image as base64.": "Envía la imagen en base64.",
  "The file is empty.": "El archivo está vacío.",
  "Use a logo of at most 512 KB.": "Usa un logotipo de 512 KB como máximo.",
  "Use a PNG or JPEG image.": "Usa una imagen PNG o JPEG.",
  "Use an image between 16 and 4,096 pixels a side.": "Usa una imagen de entre 16 y 4.096 píxeles de lado.",

  // Private runner.
  "Private runner signing is not configured.": "La firma del ejecutor privado no está configurada.",
  "Create a private-system connection before pairing a runner.": "Crea una conexión de sistema privado antes de emparejar un ejecutor.",
  "This runner version supports text-only single-turn tests.": "Esta versión del ejecutor solo admite pruebas de texto de un solo turno.",
  "This evaluation is queued until a run slot is available.": "Esta evaluación está en cola hasta que haya hueco para ejecutarla.",
  "The reported transcript does not match the frozen candidate input.": "La transcripción enviada no coincide con la entrada congelada de la prueba.",
  "A different result is already committed for this test.": "Ya hay otro resultado registrado para esta prueba.",
  "This test is already resolved.": "Esta prueba ya está resuelta.",

  // Test-set preparation (automatic generation).
  "Stop the current preparation before starting another.": "Detén la preparación en curso antes de iniciar otra.",
  "The generation models and this evaluation's budget must use the same currency.": "Los modelos de generación y el presupuesto de esta evaluación deben usar la misma moneda.",
  "The generation step has not completed yet.": "El paso de generación aún no ha terminado.",
  "The generation model's price currency does not match this evaluation's budget.": "La moneda del precio del modelo de generación no coincide con el presupuesto de esta evaluación.",
  "The durable generation workflow is unavailable.": "El flujo de generación no está disponible.",
  "The frozen generation plan changed.": "El plan de generación congelado ha cambiado.",
  "The frozen generation revisions are unavailable.": "Las versiones congeladas de la generación no están disponibles.",
  "The saved context profile is unavailable.": "El perfil de contexto guardado no está disponible.",
  "A newer preparation has replaced this one.": "Una preparación más reciente ha sustituido a esta.",
  "There are no prepared tests to keep yet.": "Aún no hay pruebas preparadas que conservar.",
  "The frozen context model revision is unavailable.": "La versión congelada del modelo de contexto no está disponible.",

  // Website logins and stored credentials.
  "Website login sessions are not configured.": "Las sesiones de inicio de sesión en sitios web no están configuradas.",
  "Choose a valid login retention.": "Elige una conservación de la sesión válida.",
  "Login sessions apply only to website systems.": "Las sesiones de inicio de sesión solo se aplican a sistemas web.",
  "The login must belong to the configured website.": "La sesión debe pertenecer al sitio web configurado.",
  "The session must be a Playwright storage state whose cookies and storage belong only to the attested website.": "La sesión debe ser un estado de almacenamiento de Playwright cuyas cookies y datos pertenezcan solo al sitio web declarado.",
  "Credential storage is not configured": "El almacén de credenciales no está configurado",
  "This connection type does not use a stored API credential": "Este tipo de conexión no usa una credencial de API guardada",

  // Your own provider keys (launch L-27) and AI models.
  "A key for this provider is already connected. Replace it instead.": "Ya hay una clave conectada para este proveedor. Sustitúyela.",
  "Your own model keys are available on pay as you go and managed plans.": "Las claves propias de modelos están disponibles en los planes de pago por uso y gestionados.",
  "That model is not available with this key. Choose one from the list.": "Ese modelo no está disponible con esta clave. Elige uno de la lista.",
  "This model is priced at €0. Enter its price per million tokens, or mark it as a free model (for example an OpenRouter :free model).": "Este modelo tiene un precio de 0 €. Indica su precio por millón de tokens o márcalo como modelo gratuito (por ejemplo, un modelo :free de OpenRouter).",
  "This model has no credit rate in the price book, so customers could use it for free. Add a rate to the price book first.": "Este modelo no tiene tarifa en créditos en la tabla de precios, así que los clientes podrían usarlo gratis. Añade antes una tarifa a la tabla de precios.",
  "The DGX Spark does not use a key.": "El DGX Spark no usa clave.",
  "Choose an evaluation.": "Elige una evaluación.",
  "Only a model with no price can be marked free.": "Solo se puede marcar como gratuito un modelo sin precio.",
  "The model and evaluation budget must use the same currency.": "El modelo y el presupuesto de la evaluación deben usar la misma moneda.",
  "Free workspaces use models on the private DGX Spark.": "Los espacios de trabajo gratuitos usan modelos del DGX Spark privado.",
  "Choose a model for this task first.": "Elige antes un modelo para esta tarea.",
  "Connect a web search engine (Tavily or Exa) first, or use a model connected through OpenRouter.": "Conecta antes un buscador web (Tavily o Exa) o usa un modelo conectado a través de OpenRouter.",
  "The search engine rejected this key.": "El buscador ha rechazado esta clave.",
  "This key has no search credits left.": "A esta clave no le quedan créditos de búsqueda.",
  "Could not reach the search engine with this key. Try again.": "No se ha podido conectar con el buscador con esta clave. Vuelve a intentarlo.",
  "The provider does not know that address or model.": "El proveedor no reconoce esa dirección o ese modelo.",

  // Evaluation controls.
  "Wait for preparation to pause before resuming.": "Espera a que la preparación se pause antes de reanudarla.",
  "This evaluation has changed. Refresh it before trying again.": "Esta evaluación ha cambiado. Actualízala antes de volver a intentarlo.",
  "This action is no longer available. Refresh the evaluation.": "Esta acción ya no está disponible. Actualiza la evaluación.",

  // Sources, uploads and test-set evidence.
  "Evidence not found": "No se encuentran las pruebas",
  "Idempotency-Key required": "Falta la cabecera Idempotency-Key",
  "Idempotency key payload mismatch": "La clave de idempotencia ya se usó con otros datos",
  "Source project does not match evaluation": "El proyecto de la fuente no coincide con la evaluación",
  "Evaluation source limit exceeded": "Se ha superado el límite de fuentes de la evaluación",
  "Upload is no longer pending": "La subida ya no está pendiente",
  "Upload state changed": "El estado de la subida ha cambiado",
  "Website source project does not match evaluation": "El proyecto del sitio web no coincide con la evaluación",
  "Website text is outside extraction limits": "El texto del sitio web supera los límites de extracción",
  "Website capture is no longer active": "La captura del sitio web ya no está activa",
  "Website changed during capture retry": "El sitio web cambió durante el reintento de captura",
  "Upload size or checksum mismatch": "El tamaño o la suma de comprobación de la subida no coinciden",
  "Draft case revision changed": "La versión del caso en borrador ha cambiado",
  "Draft changed or is unavailable": "El borrador ha cambiado o no está disponible",
  "Editable test-set case not found": "No se encuentra el caso editable del conjunto de pruebas",
  "The message structure cannot change in a customer fork": "La estructura del mensaje no puede cambiar en una copia del cliente",
  "Regression revision must be redacted and revalidated before freezing": "La versión de regresión debe anonimizarse y validarse de nuevo antes de congelarla",
  "Draft changed": "El borrador ha cambiado",
  "Manifest identity mismatch": "La identidad del manifiesto no coincide",
  "Frozen test-set identity changed": "La identidad del conjunto de pruebas congelado ha cambiado",
  "Revision hash mismatch": "El hash de la versión no coincide",
  "Regression revision has an invalid release link": "La versión de regresión tiene un enlace de publicación no válido",
  "Too many manifest files": "Hay demasiados archivos en el manifiesto",
  "Artifact checksum or size mismatch": "La suma de comprobación o el tamaño del archivo no coinciden",
  "Artifact is absent or not permitted for this audience": "El archivo no existe o no está permitido para este público",
  "Source ingestion job is no longer running": "La tarea de lectura de la fuente ya no está en curso",
  "Source artifact is no longer pending": "El archivo de la fuente ya no está pendiente",
  "Credential is not an active secret scoped to this target": "La credencial no es un secreto activo asociado a este sistema",
  "Document is unsupported, malformed or exceeds extraction limits": "El documento no es compatible, está dañado o supera los límites de extracción",
  "Content hash mismatch": "El hash del contenido no coincide",
  "Bundle content hash mismatch": "El hash del contenido del paquete no coincide",
  "Questions can only be imported into single-question test sets.": "Las preguntas solo se pueden importar en conjuntos de pruebas de preguntas sueltas.",
  "A question is no longer in this draft. Reload the test set.": "Una pregunta ya no está en este borrador. Vuelve a cargar el conjunto de pruebas.",
  "These excerpts changed since you opened them. Reopen the material and edit again.": "Estos extractos han cambiado desde que los abriste. Vuelve a abrir el material y edítalo de nuevo.",
  "An edited excerpt is not part of this material.": "Un extracto editado no forma parte de este material.",
  "Each excerpt needs 1 to 4,096 characters.": "Cada extracto necesita entre 1 y 4.096 caracteres.",
  "Keep at least one excerpt, or remove the material instead.": "Conserva al menos un extracto o elimina el material.",
  "Evaluation not found.": "No se encuentra la evaluación.",
  "Approve the test set before uploading results.": "Aprueba el conjunto de pruebas antes de subir resultados.",
  "The evaluation has no system to attribute the answers to.": "La evaluación no tiene ningún sistema al que atribuir las respuestas.",
  "Approve the test set before downloading the grading sheet.": "Aprueba el conjunto de pruebas antes de descargar la hoja de calificación.",
  "The invitation is unavailable, expired, or belongs to another account.": "La invitación no está disponible, ha caducado o pertenece a otra cuenta.",
  "Preparation was paused, stopped or replaced.": "La preparación se ha pausado, detenido o sustituido.",
  "Test-set preparation is busy. Try again shortly.": "La preparación del conjunto de pruebas está ocupada. Vuelve a intentarlo dentro de un momento.",
  "A source revision is required.": "Se necesita una versión de la fuente.",
  "The completed test set has different preparation settings.": "El conjunto de pruebas terminado tiene otra configuración de preparación.",

  // Runs, grading and reviewed reports.
  "The answer upload does not belong to this test run.": "La subida de respuestas no pertenece a esta ejecución.",
  "Execution configuration is required.": "Se necesita la configuración de ejecución.",
  "The frozen suite has no executable cases.": "El conjunto de pruebas congelado no tiene casos ejecutables.",
  "API execution supports text-only single-turn and conversation cases.": "La ejecución por API admite casos de texto de un solo turno y de conversación.",
  "The connection check has not shown multi-turn support for this target.": "La comprobación de la conexión no ha confirmado que este sistema admita varios turnos.",
  "Only finished runs can be re-graded.": "Solo se pueden volver a calificar las ejecuciones terminadas.",
  "An override requires an outcome and criterion scores.": "Una corrección manual necesita un resultado y la puntuación de cada criterio.",
  "Approve or dispute every assessed result before creating a reviewed report.": "Aprueba o discute cada resultado evaluado antes de crear un informe revisado.",

  // Platform administration.
  "Platform configuration is not connected in this environment.": "La configuración de la plataforma no está conectada en este entorno.",
  "Confirm it is you to make this platform change.": "Confirma que eres tú para hacer este cambio en la plataforma.",
  "The new ceiling is below settled and reserved spend, or uses another currency.": "El nuevo tope es inferior al gasto liquidado y reservado, o usa otra moneda.",
  "That endpoint is not approved. DGX revisions must use the protected DGX route; others must be HTTPS.": "Ese endpoint no está aprobado. Las versiones del DGX deben usar la ruta protegida del DGX; las demás, HTTPS.",
  "This model revision is not approved for that role, data class or region.": "Esta versión del modelo no está aprobada para esa función, clase de datos o región.",
  "The price currency must match the provider account.": "La moneda del precio debe coincidir con la de la cuenta del proveedor.",
  "Probes run only on DGX revisions with approved zero-price probing.": "Las pruebas de sondeo solo se hacen en versiones del DGX con sondeo sin coste aprobado.",
  "This model is priced at €0. Register its price first, or register it as a free model (for example an OpenRouter :free model).": "Este modelo tiene un precio de 0 €. Registra antes su precio o regístralo como modelo gratuito (por ejemplo, un modelo :free de OpenRouter).",
  "Register a price revision before probing this model.": "Registra una versión del precio antes de sondear este modelo.",
  "Set a workspace budget before probing.": "Fija un presupuesto del espacio de trabajo antes de sondear.",
  "A note names a slide that is not in this readout.": "Una nota menciona una diapositiva que no está en esta presentación.",
  "Evaluation runs are not enabled for this workspace.": "Las ejecuciones de evaluaciones no están activadas en este espacio de trabajo.",
  "Confirm your authority to test this website before connecting it.": "Confirma que tienes autorización para probar este sitio web antes de conectarlo.",
  // Website connections and runs.
  "This is not a website connection.": "Esta no es una conexión de sitio web.",
  "This target is not a website connection.": "Este sistema no es una conexión de sitio web.",
  "The recipe must start on the authorized website origin.": "La receta debe empezar en el origen del sitio web autorizado.",
  "Approve the prepared test set before starting a run.": "Aprueba el conjunto de pruebas preparado antes de iniciar una ejecución.",
  "This test set is not approved for the evaluation.": "Este conjunto de pruebas no está aprobado para la evaluación.",
  "The connection is not ready. Request setup assistance or retry its check.": "La conexión no está lista. Pide ayuda con la configuración o vuelve a comprobarla.",
  "Website recipes require operator review.": "Las recetas de sitios web necesitan la revisión de un operador.",
  "The test set is not ready for approval.": "El conjunto de pruebas no está listo para aprobarse.",
  "The frozen test set does not belong to this preparation.": "El conjunto de pruebas congelado no pertenece a esta preparación.",
  "This workspace reviews every question before a test set is approved. Open the full review.": "Este espacio de trabajo revisa cada pregunta antes de aprobar un conjunto de pruebas. Abre la revisión completa.",
  "The agreed monthly limit has been reached.": "Se ha alcanzado el límite mensual acordado.",
  "This connection type is not enabled for the workspace.": "Este tipo de conexión no está activado en el espacio de trabajo.",
  "This website needs connection assistance before it can run.": "Este sitio web necesita ayuda con la conexión antes de poder ejecutarse.",
  "The test set is empty.": "El conjunto de pruebas está vacío.",
  "The approved test set is for collected answers.": "El conjunto de pruebas aprobado es para respuestas recopiladas.",
  "The approved test set is not for collected answers.": "El conjunto de pruebas aprobado no es para respuestas recopiladas.",
  "Collected answers require one response per question.": "Las respuestas recopiladas necesitan una respuesta por pregunta.",
  "The approved test set requires collected answers.": "El conjunto de pruebas aprobado necesita respuestas recopiladas.",
  "Private runner jobs can only be canceled here.": "Las tareas del ejecutor privado solo se pueden cancelar aquí.",
  "Imported-answer runs without a worker can only be canceled.": "Las ejecuciones con respuestas importadas sin un proceso activo solo se pueden cancelar.",
  "Wait for the imported answer to finish saving, then cancel the run.": "Espera a que la respuesta importada termine de guardarse y cancela la ejecución.",

  // Regression cases.
  "Only a scored, failed or partially failed interaction can become a regression draft.": "Solo una interacción puntuada, fallida o parcialmente fallida puede convertirse en un borrador de regresión.",
  "The regression must be a new revision of the failed case in the same family.": "La regresión debe ser una nueva versión del caso fallido en la misma familia.",
  "The revision must trace to the failed interaction and regression draft.": "La versión debe remitir a la interacción fallida y al borrador de regresión.",
  "A named expert reviewer must revalidate the redacted revision.": "Un revisor experto identificado debe validar de nuevo la versión anonimizada.",
  "The revised case needs a verified source reference.": "El caso revisado necesita una referencia a una fuente verificada.",
  "This release path requires deterministic, locally revalidated graders.": "Esta vía de publicación necesita calificadores deterministas validados de nuevo localmente.",
  "Remove obvious personal addresses or credentials before releasing the case.": "Elimina las direcciones personales o credenciales evidentes antes de publicar el caso.",
  "This regression has already released another revision.": "Esta regresión ya ha publicado otra versión.",
  "This regression is no longer awaiting review.": "Esta regresión ya no está pendiente de revisión.",
  "The failed answer must still fail the revalidated deterministic case.": "La respuesta fallida debe seguir fallando en el caso determinista validado de nuevo.",

  // Web discovery and web search.
  "Choose a website system.": "Elige un sistema web.",
  "Web search is not turned on for this workspace. A Caudals administrator can enable it in Settings → AI models.": "La búsqueda web no está activada en este espacio de trabajo. Un administrador de Caudals puede activarla en Ajustes → Modelos de IA.",
  "A workspace budget in the model's currency is needed to search the web.": "Para buscar en la web se necesita un presupuesto del espacio de trabajo en la moneda del modelo.",

  // Sector packs and monthly new questions (launch L-25).
  "A question is both approved and rejected.": "Una pregunta está a la vez aprobada y rechazada.",
  "Some questions were already decided. Reload the list.": "Algunas preguntas ya se han decidido. Vuelve a cargar la lista.",
  "A proposed question is already in the test set; reject it instead.": "Una pregunta propuesta ya está en el conjunto de pruebas; recházala.",
  "Only owners, editors and operators decide on proposed questions.": "Solo los propietarios, editores y operadores deciden sobre las preguntas propuestas.",
  "Already decided.": "Ya está decidido.",
  "Not allowed.": "No está permitido.",
  "This question is already in the version.": "Esta pregunta ya está en la versión.",
  "This key is already in the version.": "Esta clave ya está en la versión.",
  "Check the fields.": "Revisa los campos.",
  "Remove or fix the questions that are not approved first.": "Elimina o corrige antes las preguntas que no están aprobadas.",
  "Prepare the test set first, then add more questions.": "Prepara antes el conjunto de pruebas y después añade más preguntas.",
  "The test set changed. Reload it and try again.": "El conjunto de pruebas ha cambiado. Vuelve a cargarlo e inténtalo de nuevo.",
  "Only an eligible expert records a review.": "Solo un experto habilitado registra una revisión.",
  "Only Caudals staff import packs.": "Solo el equipo de Caudals importa paquetes.",
  "Only Caudals staff move a pack version.": "Solo el equipo de Caudals cambia el estado de una versión del paquete.",

  // Price book (launch L-10).
  "Price-book revision not found.": "No se encuentra la versión de la tabla de precios.",
  "That change is not allowed in the revision's current state.": "Ese cambio no está permitido en el estado actual de la versión.",
  "Scheduled and active revisions cannot be edited. Draft a new revision instead.": "Las versiones programadas y activas no se pueden editar. Crea una versión nueva.",
  "This revision has already taken effect.": "Esta versión ya ha entrado en vigor.",
  "A revision must price every platform meter and the local model.": "Una versión debe poner precio a cada medidor de la plataforma y al modelo local.",
  "Another revision is scheduled at or after that time. Cancel it first, or choose a later date.": "Hay otra versión programada para ese momento o después. Cancélala antes o elige una fecha posterior.",
  "This revision raises prices: it needs at least 30 days' notice before it takes effect.": "Esta versión sube precios: necesita un aviso de al menos 30 días antes de entrar en vigor.",
  "A model in use by a customer route would have no credit rate in this revision.": "Un modelo que usa la ruta de un cliente se quedaría sin tarifa en créditos en esta versión.",
  "Check the rates: each must be at least 10 credits per 1M tokens, on a 5-credit step, and listed once.": "Revisa las tarifas: cada una debe ser de al menos 10 créditos por millón de tokens, en múltiplos de 5 créditos, y aparecer una sola vez.",
  "The price-book change was rejected.": "Se ha rechazado el cambio en la tabla de precios.",
  "An Idempotency-Key header is required.": "Se necesita la cabecera Idempotency-Key.",
  "Choose a date range of up to 400 days.": "Elige un intervalo de fechas de 400 días como máximo.",

  // Invoices (launch L-13).
  "Invoice not found.": "No se encuentra la factura.",
  "The number must belong to the document's series (CAU-… for invoices, CAU-R-… for rectifying invoices), or start with TEST- for a Stripe test-mode document.": "El número debe pertenecer a la serie del documento (CAU-… para facturas, CAU-R-… para facturas rectificativas) o empezar por TEST- para un documento del modo de prueba de Stripe.",
  "That number is already used in the series.": "Ese número ya se usa en la serie.",
  "This document is already issued with a different number, date or PDF.": "Este documento ya se emitió con otro número, fecha o PDF.",
  "This test document was voided.": "Este documento de prueba se anuló.",
  "Live invoices are never voided. A refund issues a rectifying invoice instead.": "Las facturas reales nunca se anulan. Un reembolso emite una factura rectificativa.",
  "The issue date must be on or after the operation date (and the original invoice's date) and not in the future.": "La fecha de emisión debe ser igual o posterior a la de la operación (y a la de la factura original) y no puede ser futura.",
  "Attach the original invoice first: a rectifying invoice cites its number.": "Adjunta antes la factura original: una factura rectificativa cita su número.",
  "Attach the issued invoice as a PDF file.": "Adjunta la factura emitida como archivo PDF.",
  "The PDF is larger than 5 MB.": "El PDF ocupa más de 5 MB.",
  "This invoice has not been issued yet.": "Esta factura aún no se ha emitido.",
  "The PDF of this invoice is not available yet.": "El PDF de esta factura aún no está disponible.",

  // Billing settings and the DPA.
  "Credit enforcement can change only while no run is queued or running in the workspace.": "El control de créditos solo se puede cambiar cuando no hay ninguna ejecución en cola ni en curso en el espacio de trabajo.",
  "Give a reason of 3 to 2,000 characters and valid settings.": "Indica un motivo de 3 a 2.000 caracteres y una configuración válida.",
  "Only a workspace owner can accept the DPA.": "Solo un propietario del espacio de trabajo puede aceptar el contrato de encargo del tratamiento.",
  "The DPA has been updated. Review the current version and accept it again.": "El contrato de encargo del tratamiento se ha actualizado. Revisa la versión actual y vuelve a aceptarlo.",
  "The acceptance could not be recorded.": "No se ha podido registrar la aceptación.",

  // Public results consent (launch L-31).
  "Only a workspace owner can give or withdraw this consent.": "Solo un propietario del espacio de trabajo puede dar o retirar este consentimiento.",
  "This report cannot be published.": "Este informe no se puede publicar.",
  "Publish this report before giving consent.": "Publica este informe antes de dar el consentimiento.",
  "This revision already has a consent. Withdraw it before giving a new one.": "Esta revisión ya tiene un consentimiento. Retíralo antes de dar uno nuevo.",
  "The copy could not be recorded.": "No se ha podido registrar la copia.",

  // Uploads and imports.
  "Upload too large": "La subida es demasiado grande",
  "The sheet is too large.": "La hoja es demasiado grande.",
  "Choose a CSV or XLSX file up to 25 MB.": "Elige un archivo CSV o XLSX de hasta 25 MB.",
  "The sheet could not be read. Save it as UTF-8 CSV or XLSX with the question sheet's headers.": "No se ha podido leer la hoja. Guárdala como CSV UTF-8 o XLSX con los encabezados de la hoja de preguntas.",
  "Import is too large.": "La importación es demasiado grande.",
  "Choose a supported file up to 25 MB.": "Elige un archivo compatible de hasta 25 MB.",
  "Use a valid invitation, or sign in to your existing account.": "Usa una invitación válida o inicia sesión en tu cuenta.",

  // Operator-only steps.
  "A Caudals operator must review and release regression cases.": "Un operador de Caudals debe revisar y publicar los casos de regresión.",
  "Only a Caudals operator can inspect regression drafts.": "Solo un operador de Caudals puede revisar los borradores de regresión.",
  "A Caudals reviewer must release a reviewed report.": "Un revisor de Caudals debe publicar un informe revisado.",
  "evaluationId or relatedRunId is required.": "Se necesita evaluationId o relatedRunId.",
  "Someone else is already reviewing this item. Refresh the queue, or take it over.": "Otra persona ya está revisando este elemento. Actualiza la cola o hazte cargo de él.",

  // Ask your report (launch L-36).
  "That report is not available.": "Ese informe no está disponible.",
  "That question is not available.": "Esa pregunta no está disponible.",
  "No model is available to answer questions about this report.": "No hay ningún modelo disponible para responder preguntas sobre este informe.",
  "The free plan answers questions with the local model only.": "El plan gratuito responde a las preguntas solo con el modelo local.",
  "This report's model cannot read the report in one question.": "El modelo de este informe no puede leer el informe completo en una sola pregunta.",
  "No budget is available to answer questions about this report.": "No hay presupuesto disponible para responder preguntas sobre este informe.",
  "Only owners can delete questions.": "Solo los propietarios pueden eliminar preguntas.",
  "Too many questions at once. Try again in a minute.": "Demasiadas preguntas a la vez. Vuelve a intentarlo dentro de un minuto.",

  // Shared reports and the vendor fix list (launch P-54).
  "A fix-list link is a private link with no other sections": "Un enlace a la lista de correcciones es un enlace privado sin otras secciones",
  "This report has no fixes to send": "Este informe no tiene correcciones que enviar",
  "This private report link is invalid, expired or revoked.": "Este enlace privado al informe no es válido, ha caducado o se ha revocado.",
  "This file could not be prepared. Try again in a few minutes.": "No se ha podido preparar este archivo. Vuelve a intentarlo dentro de unos minutos.",

  // Sign-up (launch L-05) and workspace deletion.
  "This request is not allowed.": "Esta petición no está permitida.",
  "Enter a valid work email.": "Escribe un correo de trabajo válido.",
  "Use your work email. Personal and temporary addresses cannot open a workspace; the public demo needs no account.": "Usa tu correo de trabajo. Las direcciones personales y temporales no pueden abrir un espacio de trabajo; la demo pública no necesita cuenta.",
  "Too many requests. Try again later.": "Demasiadas peticiones. Vuelve a intentarlo más tarde.",
  "The link could not be sent. Try again in a few minutes.": "No se ha podido enviar el enlace. Vuelve a intentarlo dentro de unos minutos.",
  "This link has expired or was already used.": "Este enlace ha caducado o ya se ha usado.",
  "Someone at your company already created a Caudals workspace. Ask its owner to invite you.": "Alguien de tu empresa ya ha creado un espacio de trabajo en Caudals. Pide a su propietario que te invite.",
  "Accept the Terms of Service and the Privacy Policy to create your account.": "Acepta los Términos del servicio y la Política de privacidad para crear tu cuenta.",
  "Use a public HTTPS website URL without credentials, query parameters or fragments.": "Usa la URL HTTPS pública de un sitio web, sin credenciales, parámetros ni fragmentos.",
  "Use the website's standard HTTPS address.": "Usa la dirección HTTPS estándar del sitio web.",
  "Type the workspace name exactly to confirm deletion.": "Escribe el nombre exacto del espacio de trabajo para confirmar la eliminación.",
  // Connection and web-search tests (platform administrators, Settings → AI models).
  "The search engine rejected the key.": "El buscador ha rechazado la clave.",
  "The key has no search credits left.": "A la clave no le quedan créditos de búsqueda.",
  "The search engine did not answer.": "El buscador no ha respondido.",
  "This is a reasoning model: it used its answer budget on hidden reasoning and returned nothing. Prefer a non-reasoning model for the engine.": "Es un modelo de razonamiento: ha gastado su presupuesto de respuesta en razonamiento oculto y no ha devuelto nada. Para el motor, mejor un modelo sin razonamiento.",
  "The model returned an empty answer.": "El modelo ha devuelto una respuesta vacía.",
  "The model answered with valid JSON.": "El modelo ha respondido con JSON válido.",
  "The model answered, but not with clean JSON; generation may need retries.": "El modelo ha respondido, pero no con JSON limpio; la generación puede necesitar reintentos.",
  "It also reasons before answering, which is slower and uses more tokens.": "Además razona antes de responder, lo que es más lento y usa más tokens.",
  "The provider did not answer. Check the address, key and model name.": "El proveedor no ha respondido. Revisa la dirección, la clave y el nombre del modelo.",

  // Email preferences.
  "A token is required.": "Falta el token.",
  "This unsubscribe link is not valid.": "Este enlace para darse de baja no es válido.",

  // Sector pack items (import files and edits).
  "The source cannot be retrieved in the future.": "La fuente no puede tener una fecha de consulta futura.",
  "The as-of date is in the future.": "La fecha de referencia es futura.",
  "A licensed source needs its licence reference.": "Una fuente con licencia necesita la referencia de su licencia.",
  "Duplicate key.": "Clave duplicada.",

  // Sector pack rules enforced by the database (migration 100), passed through by the API.
  "sector pack writes need an actor": "Los cambios en los paquetes sectoriales necesitan un autor.",
  "sector pack writes run outside any workspace; customer material never enters a pack": "Los cambios en los paquetes sectoriales se hacen fuera de cualquier espacio de trabajo; el material de los clientes nunca entra en un paquete.",
  "only Caudals staff can do this": "Solo el equipo de Caudals puede hacer esto.",
  "only Caudals staff and experts write sector packs": "Solo el equipo de Caudals y los expertos redactan paquetes sectoriales.",
  "sector pack versions are never deleted": "Las versiones de los paquetes sectoriales nunca se eliminan.",
  "published sector pack versions are immutable: create a new version": "Las versiones publicadas de un paquete sectorial no se pueden modificar: crea una versión nueva.",
  "sector pack version identity is immutable": "La identidad de la versión del paquete sectorial no se puede modificar.",
  "an empty sector pack version cannot be published": "No se puede publicar una versión vacía de un paquete sectorial.",
  "items of a published sector pack version are immutable: create a new version": "Los elementos de una versión publicada del paquete sectorial no se pueden modificar: crea una versión nueva.",
  "sector pack item identity and author are immutable": "La identidad y el autor de un elemento del paquete sectorial no se pueden modificar.",
  "an edited sector pack item must be reviewed again": "Un elemento editado del paquete sectorial debe revisarse de nuevo.",
  "a published pack keeps its sector, jurisdiction and language": "Un paquete publicado conserva su sector, su jurisdicción y su idioma.",
  "a new version copies a published version of the same pack": "Una versión nueva copia una versión publicada del mismo paquete.",
  "sector pack items carry no workspace or customer case reference": "Los elementos de los paquetes sectoriales no llevan referencias a espacios de trabajo ni a casos de clientes.",
  "a source cannot be retrieved in the future": "Una fuente no puede tener una fecha de consulta futura.",
  "only an eligible expert records a sector pack review": "Solo un experto habilitado registra la revisión de un paquete sectorial.",
  "unknown review decision": "Decisión de revisión desconocida.",
  "say what should change": "Indica qué debe cambiar.",
  "items are reviewed while their version is in review": "Los elementos se revisan mientras su versión está en revisión.",
  "the author or last editor cannot review their own item": "El autor o el último editor no pueden revisar su propio elemento.",
  "add questions before asking for review": "Añade preguntas antes de pedir la revisión.",
  "unknown sector pack version state": "Estado desconocido de la versión del paquete sectorial.",
  "sector pack links are immutable": "Los vínculos de los paquetes sectoriales no se pueden modificar.",
  "only items of published sector packs enter a workspace test set": "Solo los elementos de paquetes sectoriales publicados entran en el conjunto de pruebas de un espacio de trabajo.",
  "sector pack statistics are for Caudals staff and experts": "Las estadísticas de los paquetes sectoriales son para el equipo de Caudals y los expertos.",
  "workspace context required": "Se necesita el contexto de un espacio de trabajo.",
  "not allowed": "No está permitido.",
  "only owners turn monthly new questions on or off": "Solo los propietarios activan o desactivan las preguntas nuevas mensuales.",
  "monthly new questions need a managed or pay-as-you-go plan": "Las preguntas nuevas mensuales necesitan un plan gestionado o de pago por uso.",
  "question proposals are kept as evidence": "Las preguntas propuestas se conservan como prueba.",
  "a decided question proposal is immutable": "Una pregunta propuesta ya decidida no se puede modificar.",
  "a question proposal changes only by its decision": "Una pregunta propuesta solo cambia con su decisión.",
  "unknown decision": "Decisión desconocida.",
  "this question was already decided": "Esta pregunta ya se ha decidido.",
  "an approved proposal needs the case revision that carries it": "Una propuesta aprobada necesita la versión del caso que la incluye.",
};

type Pattern = string | ((slots: string[], message: string) => string | null);

/** `${hint} ${provider's message}` (lib/evals/repositories/engine-settings.ts). */
const PROVIDER_DETAIL = "{} {}";

/**
 * Sentences with run-time parts. The key is the English sentence with `{}`
 * for each part, as `scripts/i18n/api-errors.ts` writes it; a Spanish
 * template names the parts `{0}`, `{1}`… in any order. A function gets the
 * parts and returns null when it cannot say them in Spanish.
 */
export const API_PATTERNS_ES: Record<string, Pattern> = {
  "A token that starts runs must expire within {} days.": "Un token que inicia ejecuciones debe caducar en {0} días como máximo.",
  "Too many requests for this token. Try again in {} seconds.": "Demasiadas peticiones con este token. Vuelve a intentarlo dentro de {0} segundos.",
  "A workspace can have up to {} destinations. Delete one first.": "Un espacio de trabajo puede tener hasta {0} destinos. Elimina uno antes.",
  "Too many test messages. Try again in {} minutes.": "Demasiados mensajes de prueba. Vuelve a intentarlo dentro de {0} minutos.",
  // A context answer: the question as the person wrote it, then the hint.
  "“{}”: {}": ([question, hint]) => {
    const text = sentence(hint);
    return text === null ? null : `“${question}”: ${text}`;
  },
  "{} rejected this key. Check that it is complete and active, then try again.": "{0} ha rechazado esta clave. Comprueba que está completa y activa y vuelve a intentarlo.",
  "Could not check the key with {} right now. Try again in a minute.": "Ahora no se ha podido comprobar la clave con {0}. Vuelve a intentarlo dentro de un minuto.",
  "{} answered in an unexpected way. Try again in a minute.": "{0} ha respondido de forma inesperada. Vuelve a intentarlo dentro de un minuto.",
  // A model provider's error: our hint, then the provider's own words, quoted as they came
  // (tried last, and only for PROVIDER_UNAVAILABLE: see providerDetail).
  [PROVIDER_DETAIL]: (_, message) => providerDetail(message),
  "The provider answered {}.": "El proveedor ha respondido {0}.",
  "{}k context": "contexto de {0}k",
  "Quote not found in this test set's sources for rows {}. Copy it verbatim from the page, or add that page as a source first.": "No se encuentra la cita en las fuentes de este conjunto de pruebas para las filas {0}. Cópiala literalmente de la página o añade antes esa página como fuente.",
  "The sheet does not match the approved test set: {}.": ([detail]) => `La hoja no coincide con el conjunto de pruebas aprobado: ${sheetProblems(detail)}.`,
  "Choose at most {} pages.": "Elige como máximo {0} páginas.",
  "The evaluation “{}” tests this system. Delete that evaluation first.": "La evaluación «{0}» prueba este sistema. Elimina antes esa evaluación.",
  "The evaluation “{}” uses this test set. Delete that evaluation first.": "La evaluación «{0}» usa este conjunto de pruebas. Elimina antes esa evaluación.",
  "Quote not found in this evaluation's sources for questions {}. Copy it verbatim, or add that page as a source first.": "No se encuentra la cita en las fuentes de esta evaluación para las preguntas {0}. Cópiala literalmente o añade antes esa página como fuente.",
  "Evaluation caps above {} need a founder decision (D-03).": "Los topes de evaluación superiores a {0} necesitan una decisión del fundador (D-03).",
  "Choose between 1 and {} different results of this report revision.": "Elige entre 1 y {0} resultados distintos de esta versión del informe.",
  "Keep each note under {} characters.": "Escribe cada nota en menos de {0} caracteres.",
  "Check at least {} questions of this test set before approving it.": "Revisa al menos {0} preguntas de este conjunto de pruebas antes de aprobarlo.",
  "A pack is published with at least {} expert-approved questions; this version has {}.": "Un paquete se publica con al menos {0} preguntas aprobadas por expertos; esta versión tiene {1}.",
  // Import of a pack file: each item's problems; validator output has no Spanish, so then the code's message shows.
  "The file has {} problem{}: {}": ([count, , detail]) => {
    const parts = detail.split(" · ").map((part) => {
      const match = /^(#\d+(?: \([^)]*\))?) (.+)$/.exec(part);
      const text = match ? sentence(match[2]) : null;
      return match && text !== null ? `${match[1]} ${text}` : null;
    });
    if (parts.some((part) => part === null)) return null;
    return `El archivo tiene ${count} ${count === "1" ? "problema" : "problemas"}: ${parts.join(" · ")}`;
  },
  "Key fact not in the excerpt: {}": "Un dato clave no está en el extracto: {0}",
  "Same question as {}.": "Misma pregunta que {0}.",
  "This plan allows {} questions per test set.": "Este plan permite {0} preguntas por conjunto de pruebas.",
  "Not enough credits for this run. Add {} credits to continue.": "No hay créditos suficientes para esta ejecución. Añade {0} créditos para continuar.",
  "This run would pass the workspace's monthly credit limit ({} of {} credits used this month). An owner can raise it in Settings → Billing and usage.": "Esta ejecución superaría el límite mensual de créditos del espacio de trabajo ({0} de {1} créditos usados este mes). Un propietario puede ampliarlo en Ajustes → Facturación y uso.",
  "This run would pass the per-run credit limit of {} credits. An owner can raise it in Settings → Billing and usage.": "Esta ejecución superaría el límite de {0} créditos por ejecución. Un propietario puede ampliarlo en Ajustes → Facturación y uso.",
  "Check the sheet: {}.": ([detail]) => `Revisa la hoja: ${sheetProblems(detail)}.`,
  "Too many connection checks. Try again in {} min.": "Demasiadas comprobaciones de conexión. Vuelve a intentarlo dentro de {0} min.",
  // Ask your report (launch L-36).
  "You can ask {} questions about a report a day. Try again tomorrow.": "Puedes hacer {0} preguntas al día sobre un informe. Vuelve a intentarlo mañana.",
  "The free plan includes {} report questions a month.": "El plan gratuito incluye {0} preguntas al mes sobre los informes.",
  "Ask in 1 to {} characters.": "Escribe la pregunta en 1 a {0} caracteres.",
  "Not enough credits to ask a question. Add {} credits to continue.": "No hay créditos suficientes para hacer una pregunta. Añade {0} créditos para continuar.",
  "sector pack version cannot move from {} to {}": (states) => {
    const names: Record<string, string> = { draft: "borrador", in_review: "en revisión", published: "publicada" };
    return states.every((state) => names[state]) ? `La versión del paquete sectorial no puede pasar de ${names[states[0]]} a ${names[states[1]]}.` : null;
  },
  "{} sector pack items lack an approving expert review; nothing is published without a recorded reviewer": "{0} elementos del paquete sectorial no tienen una revisión aprobatoria de un experto; no se publica nada sin un revisor registrado.",
};

/** "row 3: veredicto_invalid, motivo_required; 2 question(s) missing" (the column codes stay as written in the sheet). */
function sheetProblems(detail: string): string {
  return detail
    .replace(/\brow (\d+):/g, "fila $1:")
    .replace(/\b(\d+) question\(s\) missing\b/g, (_, count: string) => (count === "1" ? "falta 1 pregunta" : `faltan ${count} preguntas`));
}

/** The message every code shows when its sentence has no Spanish (or none was sent). */
export const API_CODES: Record<string, { en: string; es: string }> = {
  // Shared codes.
  INPUT_INVALID: { en: "Check the details you entered and try again.", es: "Revisa los datos que has introducido y vuelve a intentarlo." },
  SCOPE_DENIED: { en: "You do not have access to this, or it no longer exists.", es: "No tienes acceso a esto o ya no existe." },
  NOT_FOUND: { en: "This was not found. Reload the page.", es: "No se encuentra. Vuelve a cargar la página." },
  SESSION_REQUIRED: { en: "Your session has ended. Sign in again.", es: "Tu sesión ha terminado. Vuelve a iniciar sesión." },
  REAUTHENTICATION_REQUIRED: { en: "Confirm it is you to continue.", es: "Confirma que eres tú para continuar." },
  MFA_ENROLMENT_REQUIRED: { en: "Turn on two-factor authentication to continue.", es: "Activa la verificación en dos pasos para continuar." },
  SERVICE_UNAVAILABLE: { en: "The service is temporarily unavailable. Try again in a few minutes.", es: "El servicio no está disponible en este momento. Vuelve a intentarlo dentro de unos minutos." },
  RATE_LIMITED: { en: "Too many requests. Wait a moment and try again.", es: "Demasiadas peticiones. Espera un momento y vuelve a intentarlo." },
  VERSION_CONFLICT: { en: "This changed in the meantime. Reload the page and try again.", es: "Esto ha cambiado mientras tanto. Vuelve a cargar la página e inténtalo de nuevo." },
  VERSION_CHANGED: { en: "A newer version is available. Review it and try again.", es: "Hay una versión más reciente. Revísala y vuelve a intentarlo." },
  CONFLICT: { en: "This already exists or changed in the meantime. Reload the page.", es: "Esto ya existe o ha cambiado mientras tanto. Vuelve a cargar la página." },
  SETTINGS_CONFLICT: { en: "The settings changed in the meantime. Reload them and try again.", es: "La configuración ha cambiado mientras tanto. Vuelve a cargarla e inténtalo de nuevo." },
  IDEMPOTENCY_CONFLICT: { en: "This request was already sent with different data. Start again.", es: "Esta petición ya se envió con otros datos. Empieza de nuevo." },
  IDEMPOTENCY_REQUIRED: { en: "The request is missing its Idempotency-Key.", es: "A la petición le falta la cabecera Idempotency-Key." },
  WORK_LOCKED: { en: "This work is locked while someone else edits it.", es: "Este trabajo está bloqueado mientras otra persona lo edita." },
  WORKSPACE_BUSY: { en: "The workspace is busy. Try again when its runs have finished.", es: "El espacio de trabajo está ocupado. Vuelve a intentarlo cuando terminen sus ejecuciones." },
  EVIDENCE_ERROR: { en: "The stored material could not be used. Reload the page and try again.", es: "No se ha podido usar el material guardado. Vuelve a cargar la página e inténtalo de nuevo." },
  EXPORT_FAILED: { en: "The file could not be prepared. Try again in a few minutes.", es: "No se ha podido preparar el archivo. Vuelve a intentarlo dentro de unos minutos." },
  EMAIL_UNCONFIGURED: { en: "Email sending is not configured in this environment.", es: "El envío de correos no está configurado en este entorno." },
  OWNER_REQUIRED: { en: "Only a workspace owner can do this.", es: "Solo un propietario del espacio de trabajo puede hacer esto." },
  REASON_REQUIRED: { en: "Give a reason of 3 to 2,000 characters.", es: "Indica un motivo de 3 a 2.000 caracteres." },
  OPERATOR_REQUIRED: { en: "Only Caudals operations can do this.", es: "Solo el equipo de operaciones de Caudals puede hacer esto." },
  PUBLICATION_NOT_ALLOWED: { en: "This report cannot be published.", es: "Este informe no se puede publicar." },
  REPORT_NOT_PUBLISHED: { en: "Publish this report first.", es: "Publica antes este informe." },
  CONSENT_EXISTS: { en: "This revision already has a consent.", es: "Esta revisión ya tiene un consentimiento." },
  RETENTION_EXPIRED: { en: "These answers were removed under the workspace's retention setting.", es: "Estas respuestas se eliminaron por el ajuste de conservación del espacio de trabajo." },

  // Plans, credits and limits.
  PLAN_LIMIT: { en: "This is beyond what your plan includes.", es: "Esto supera lo que incluye tu plan." },
  PLAN_LIMIT_SYSTEMS: { en: "This workspace has reached its plan's number of AI systems.", es: "Este espacio de trabajo ha alcanzado el número de sistemas de IA de su plan." },
  PLAN_LIMIT_RUNS: { en: "This workspace has used its plan's runs for this month.", es: "Este espacio de trabajo ha agotado las ejecuciones de su plan este mes." },
  PLAN_LIMIT_QUESTIONS: { en: "This test set is larger than the workspace's plan allows.", es: "Este conjunto de pruebas es más grande de lo que permite el plan del espacio de trabajo." },
  PLAN_LIMIT_CONNECTION: { en: "This connection type is not included in the workspace's plan.", es: "Este tipo de conexión no está incluido en el plan del espacio de trabajo." },
  PLAN_LIMIT_SCHEDULES: { en: "Scheduled monitoring is not included in the workspace's plan.", es: "La monitorización programada no está incluida en el plan del espacio de trabajo." },
  PLAN_LIMIT_MEMBERS: { en: "This workspace has reached its plan's number of members.", es: "Este espacio de trabajo ha alcanzado el número de miembros de su plan." },
  CREDITS_EXHAUSTED: { en: "Not enough credits. Add credits to continue.", es: "No hay créditos suficientes. Añade créditos para continuar." },
  CAP_REACHED: { en: "This would pass a credit limit of the workspace. An owner can raise it in Settings → Billing and usage.", es: "Esto superaría un límite de créditos del espacio de trabajo. Un propietario puede ampliarlo en Ajustes → Facturación y uso." },
  BUDGET_PAUSED: { en: "Paused: the agreed spending limit has been reached.", es: "En pausa: se ha alcanzado el límite de gasto acordado." },
  BUDGET_UNAVAILABLE: { en: "No budget is set up for this work. A Caudals administrator can set one.", es: "No hay ningún presupuesto configurado para este trabajo. Un administrador de Caudals puede configurarlo." },
  PROVIDER_UNAVAILABLE: { en: "The model or service behind this step is not available. Try again later or choose another in Settings → AI models.", es: "El modelo o servicio de este paso no está disponible. Vuelve a intentarlo más tarde o elige otro en Ajustes → Modelos de IA." },
  BYOK_KEY_REJECTED: { en: "The provider rejected this key. Check it and try again.", es: "El proveedor ha rechazado esta clave. Revísala y vuelve a intentarlo." },
  BYOK_PLAN_REQUIRED: { en: "Your own model keys are available on pay as you go and managed plans.", es: "Las claves propias de modelos están disponibles en los planes de pago por uso y gestionados." },

  // Payments, invoices and the ops billing console.
  BILLING_PROFILE_REQUIRED: { en: "Add your billing details first.", es: "Añade antes tus datos de facturación." },
  TAX_ID_INVALID: { en: "Check the tax ID.", es: "Revisa la identificación fiscal." },
  TAX_REVIEW_REQUIRED: { en: "Your billing details need a manual review. Write to hello@caudals.com.", es: "Tus datos de facturación necesitan una revisión manual. Escríbenos a hello@caudals.com." },
  TAX_REVIEW_TERRITORY: { en: "Billing addresses in the Canary Islands, Ceuta and Melilla need a manual review. Write to hello@caudals.com.", es: "Las direcciones de facturación en Canarias, Ceuta y Melilla necesitan una revisión manual. Escríbenos a hello@caudals.com." },
  COUNTRY_INVALID: { en: "Choose the country of your billing address.", es: "Elige el país de tu dirección de facturación." },
  CARD_REQUIRED: { en: "Buy credits once with a card first.", es: "Compra créditos una vez con tarjeta primero." },
  CHECKOUT_CLOSED: { en: "This checkout has ended. Start a new top-up.", es: "Este pago ha terminado. Empieza una nueva recarga." },
  PURCHASE_LIMIT: { en: "This purchase is above the limit for new accounts. Write to hello@caudals.com.", es: "Esta compra supera el límite de las cuentas nuevas. Escríbenos a hello@caudals.com." },
  PURCHASE_RATE_LIMIT: { en: "Too many top-ups today. Try again tomorrow.", es: "Demasiadas recargas hoy. Vuelve a intentarlo mañana." },
  REFUND_NOT_ALLOWED: { en: "Only an unused purchase can be refunded, within 14 days of payment.", es: "Solo se puede reembolsar una compra sin usar, en los 14 días siguientes al pago." },
  REFUND_PENDING: { en: "The refund is still waiting for Stripe. Try again in a few minutes.", es: "El reembolso sigue pendiente de Stripe. Vuelve a intentarlo dentro de unos minutos." },
  NOTHING_TO_REFUND: { en: "There is nothing left to refund.", es: "No queda nada por reembolsar." },
  DISPUTE_OPEN: { en: "A payment dispute is open. The account stays frozen until Stripe closes it.", es: "Hay una disputa de pago abierta. La cuenta sigue congelada hasta que Stripe la cierre." },
  ACCOUNT_FROZEN: { en: "This credit account is frozen.", es: "Esta cuenta de créditos está congelada." },
  ACCOUNT_MISSING: { en: "This workspace has no credit account.", es: "Este espacio de trabajo no tiene cuenta de créditos." },
  ORDER_NOT_FOUND: { en: "Order not found.", es: "No se encuentra el pedido." },
  ORDER_NOT_PAID: { en: "This order was not paid.", es: "Este pedido no se pagó." },
  ENTRY_NOT_FOUND: { en: "Ledger entry not found.", es: "No se encuentra el movimiento." },
  ENTRY_NOT_REVERSIBLE: { en: "This entry cannot be reversed.", es: "Este movimiento no se puede revertir." },
  ENTRY_ALREADY_REVERSED: { en: "This entry was already reversed or refunded.", es: "Este movimiento ya se revirtió o se devolvió." },
  REVERSAL_EXCEEDS_REMAINING: { en: "Its credits were already used or are held. Correct what is left with an adjustment.", es: "Sus créditos ya se usaron o están retenidos. Corrige lo que quede con un ajuste." },
  LOT_NOT_FOUND: { en: "Credit lot not found.", es: "No se encuentra el lote de créditos." },
  LOT_NOT_EXTENDABLE: { en: "Only lots with credits left that have not expired yet can be extended.", es: "Solo se pueden ampliar los lotes con créditos que aún no han caducado." },
  APPROVAL_NOT_FOUND: { en: "Approval request not found.", es: "No se encuentra la solicitud de aprobación." },
  // Provider-price acknowledgements and manual tax reviews (launch G2).
  PRICE_CHECK_NOT_FOUND: { en: "Price check not found.", es: "No se encuentra el control de precios." },
  PRICE_CHECK_SUPERSEDED: { en: "A newer price check exists. Review that one instead.", es: "Hay un control de precios más reciente. Revisa ese." },
  PRICE_CHECK_CLEAN: { en: "This price check found nothing that needs a decision.", es: "Este control de precios no encontró nada que requiera una decisión." },
  TAX_REVIEW_NOT_PENDING: { en: "These billing details no longer wait for a review.", es: "Estos datos de facturación ya no están pendientes de revisión." },
  TAX_REVIEW_CHANGED: { en: "The billing details changed after you opened them. Reload and review them again.", es: "Los datos de facturación cambiaron después de abrirlos. Vuelve a cargarlos y revísalos de nuevo." },
  TAX_TREATMENT_NOT_ALLOWED: { en: "That treatment does not apply to this review. A reverse charge needs the VIES consultation number.", es: "Ese tratamiento no corresponde a esta revisión. La inversión del sujeto pasivo necesita el número de consulta de VIES." },
  APPROVAL_NOT_PENDING: { en: "This request is no longer waiting for approval.", es: "Esta solicitud ya no está pendiente de aprobación." },
  APPROVAL_NOT_REQUIRED: { en: "This action does not need a second approval. Run it directly.", es: "Esta acción no necesita una segunda aprobación. Ejecútala directamente." },
  APPROVAL_EXPIRED: { en: "This request expired without a second approval. Ask for a new one.", es: "Esta solicitud caducó sin una segunda aprobación. Pide una nueva." },
  APPROVAL_PAYLOAD_MISMATCH: { en: "The request is not the one you reviewed. Reload it and review it again.", es: "La solicitud no es la que revisaste. Vuelve a cargarla y revísala de nuevo." },
  APPROVER_MUST_DIFFER: { en: "A different platform administrator must approve this request.", es: "Otro administrador de la plataforma debe aprobar esta solicitud." },
  SECOND_APPROVER_REQUIRED: { en: "A second platform administrator must approve this action.", es: "Un segundo administrador de la plataforma debe aprobar esta acción." },
  PRICE_BOOK_NOT_FOUND: { en: "Price-book revision not found.", es: "No se encuentra la versión de la tabla de precios." },
  PRICE_BOOK_TRANSITION: { en: "That change is not allowed in the revision's current state.", es: "Ese cambio no está permitido en el estado actual de la versión." },
  PRICE_BOOK_IMMUTABLE: { en: "Scheduled and active revisions cannot be edited.", es: "Las versiones programadas y activas no se pueden editar." },
  PRICE_BOOK_IN_EFFECT: { en: "This revision has already taken effect.", es: "Esta versión ya ha entrado en vigor." },
  PRICE_BOOK_INCOMPLETE: { en: "A revision must price every platform meter and the local model.", es: "Una versión debe poner precio a cada medidor de la plataforma y al modelo local." },
  ROUTE_UNPRICED: { en: "A model in use would have no credit rate in this revision.", es: "Un modelo en uso se quedaría sin tarifa en créditos en esta versión." },
  SCHEDULE_CONFLICT: { en: "Another revision is scheduled at or after that time.", es: "Hay otra versión programada para ese momento o después." },
  NOTICE_PERIOD_REQUIRED: { en: "A price increase needs at least 30 days' notice.", es: "Una subida de precios necesita un aviso de al menos 30 días." },
  NOTICE_NOT_SENT: { en: "The price notice did not go out in time, so this revision cannot take effect.", es: "El aviso de precios no salió a tiempo, así que esta versión no puede entrar en vigor." },
  NOTICE_TOO_LATE: { en: "The notice deadline has passed. Schedule the revision at least 30 days after today.", es: "El plazo del aviso ha pasado. Programa la versión al menos 30 días después de hoy." },
  NOTICE_NOT_REQUIRED: { en: "This revision raises no rate: decreases apply without notice.", es: "Esta versión no sube ninguna tarifa: las bajadas se aplican sin aviso." },
  NOTICE_SENDS_INTERNAL_ONLY: { en: "Owner notices are off in this environment. Send a test to the internal address instead.", es: "Los avisos a propietarios están desactivados en este entorno. Envía una prueba a la dirección interna." },
  INVOICE_NOT_FOUND: { en: "Invoice not found.", es: "No se encuentra la factura." },
  INVOICE_ALREADY_ISSUED: { en: "This document is already issued.", es: "Este documento ya se ha emitido." },
  INVOICE_NUMBER_INVALID: { en: "Check the invoice number and its series.", es: "Revisa el número de la factura y su serie." },
  INVOICE_NUMBER_TAKEN: { en: "That number is already used in the series.", es: "Ese número ya se usa en la serie." },
  INVOICE_VOIDED: { en: "This test document was voided.", es: "Este documento de prueba se anuló." },
  INVOICE_VOID_LIVE: { en: "Live invoices are never voided. A refund issues a rectifying invoice instead.", es: "Las facturas reales nunca se anulan. Un reembolso emite una factura rectificativa." },
  ISSUE_DATE_INVALID: { en: "Check the issue date.", es: "Revisa la fecha de emisión." },
  ORIGINAL_NOT_ISSUED: { en: "Attach the original invoice first.", es: "Adjunta antes la factura original." },
  PDF_INVALID: { en: "Attach the issued invoice as a PDF file.", es: "Adjunta la factura emitida como archivo PDF." },
  PDF_TOO_LARGE: { en: "The PDF is larger than 5 MB.", es: "El PDF ocupa más de 5 MB." },

  // Connections, test sets and runs.
  CONNECTION_UNSUPPORTED: { en: "This connection cannot do that yet. Repair it or choose another connection type.", es: "Esta conexión aún no puede hacer eso. Repárala o elige otro tipo de conexión." },
  DESTINATION_INVALID: { en: "Use a public HTTPS address.", es: "Usa una dirección HTTPS pública." },
  GENERATION_INVALID: { en: "The test set could not be prepared with these settings. Check them and try again.", es: "No se ha podido preparar el conjunto de pruebas con esta configuración. Revísala y vuelve a intentarlo." },
  GENERATION_NOT_READY: { en: "The test set is still being prepared.", es: "El conjunto de pruebas aún se está preparando." },
  REVIEW_REQUIRED: { en: "This needs an approved review first.", es: "Esto necesita antes una revisión aprobada." },
  REPORT_NOT_READY: { en: "The report is not ready for this yet.", es: "El informe aún no está listo para esto." },
  SHARE_REQUIRED: { en: "Create the private link first.", es: "Crea antes el enlace privado." },
  SHARE_UNAVAILABLE: { en: "This private report link is invalid, expired or revoked.", es: "Este enlace privado al informe no es válido, ha caducado o se ha revocado." },

  // Experts and improvement datasets.
  EXPERT_NOT_READY: { en: "The expert's onboarding checklist is not complete.", es: "La lista de incorporación del experto no está completa." },
  EXPERT_REVIEW_UNRECORDED: { en: "No expert review has been recorded yet.", es: "Aún no se ha registrado ninguna revisión de expertos." },
  CONFLICT_DISCLOSED: { en: "A conflict of interest was declared. Resolve it before working.", es: "Se ha declarado un conflicto de intereses. Resuélvelo antes de trabajar." },
  INDEPENDENT_REVIEW_REQUIRED: { en: "This needs an independent reviewer.", es: "Esto necesita un revisor independiente." },
  REVIEWER_INELIGIBLE: { en: "Choose a verified reviewer with accepted terms.", es: "Elige un revisor verificado que haya aceptado las condiciones." },
  LINEAGE_INVALID: { en: "These records do not belong to the same project.", es: "Estos registros no pertenecen al mismo proyecto." },
  RELEASE_EMPTY: { en: "Add at least one reviewed item before release.", es: "Añade al menos un elemento revisado antes de publicar." },
  COMPARISON_INCOMPATIBLE: { en: "Follow-up validation requires a compatible comparison.", es: "La validación de seguimiento necesita una comparación compatible." },
  HELDOUT_EVIDENCE_REQUIRED: { en: "Follow-up validation requires a matched, scorable held-out case.", es: "La validación de seguimiento necesita un caso reservado, emparejado y puntuable." },

  // Partners (launch L-28).
  PARTNER_INACTIVE: { en: "This partner account is suspended or closed.", es: "Esta cuenta de partner está suspendida o cerrada." },
  PARTNER_CLOSED: { en: "This partner account is closed.", es: "Esta cuenta de partner está cerrada." },
  PARTNER_CLIENT_LIMIT: { en: "This partner account has reached its number of client workspaces.", es: "Esta cuenta de partner ha alcanzado su número de espacios de trabajo de clientes." },
  PARTNER_CLIENT_LINKED: { en: "That workspace is already managed by a partner.", es: "Ese espacio de trabajo ya lo gestiona un partner." },
  PARTNER_CLIENT_ORPHAN: { en: "The client workspace would have no owner of its own.", es: "El espacio de trabajo del cliente se quedaría sin propietario propio." },
  PARTNER_CLIENTS_ACTIVE: { en: "Some client workspaces have no owner of their own.", es: "Algunos espacios de trabajo de clientes no tienen propietario propio." },
  PARTNER_LAST_ADMIN: { en: "The partner needs another admin first.", es: "El partner necesita antes otro administrador." },
  PARTNER_CODE_LIMIT: { en: "A partner can have 20 active referral codes. Revoke one first.", es: "Un partner puede tener 20 códigos de referido activos. Revoca uno antes." },
  PARTNER_ALLOWANCE_INACTIVE: { en: "The partner has no allowance in effect today.", es: "El partner no tiene ninguna asignación en vigor hoy." },
  PARTNER_ALLOWANCE_EXCEEDED: { en: "That grant would exceed this month's partner allowance.", es: "Esa concesión superaría la asignación del partner de este mes." },
  USER_NOT_FOUND: { en: "No verified Caudals account uses that address.", es: "Ninguna cuenta verificada de Caudals usa esa dirección." },
  MEMBER_NOT_FOUND: { en: "That person is not in this account.", es: "Esa persona no está en esta cuenta." },
  LOGO_EMPTY: { en: "The file is empty.", es: "El archivo está vacío." },
  LOGO_TOO_LARGE: { en: "Use a logo of at most 512 KB.", es: "Usa un logotipo de 512 KB como máximo." },
  LOGO_TYPE: { en: "Use a PNG or JPEG image.", es: "Usa una imagen PNG o JPEG." },
  LOGO_DIMENSIONS: { en: "Use an image between 16 and 4,096 pixels a side.", es: "Usa una imagen de entre 16 y 4.096 píxeles de lado." },

  // Ask your report (launch L-36).
  REPORT_QUESTION_DAILY_LIMIT: { en: "You have asked today's questions about this report. Try again tomorrow.", es: "Ya has hecho las preguntas de hoy sobre este informe. Vuelve a intentarlo mañana." },
  REPORT_QUESTION_MONTHLY_LIMIT: { en: "This month's report questions are used up.", es: "Ya se han usado las preguntas sobre informes de este mes." },
  REPORT_QUESTION_MODEL_UNAVAILABLE: { en: "No model is available to answer questions about this report.", es: "No hay ningún modelo disponible para responder preguntas sobre este informe." },
  REPORT_QUESTION_MODEL_NOT_PERMITTED: { en: "The free plan answers questions with the local model only.", es: "El plan gratuito responde a las preguntas solo con el modelo local." },

  // Review queue assignments (launch G1).
  REVIEW_ASSIGNED: { en: "Someone else is already reviewing this item.", es: "Otra persona ya está revisando este elemento." },

  // Prospect snapshots (launch L-21).
  SNAPSHOT_DAILY_CAP: { en: "Today's snapshot limit is reached. Try again tomorrow.", es: "Se ha alcanzado el límite diario de pruebas externas. Vuelve a intentarlo mañana." },
  SNAPSHOT_HOST_LIMIT: { en: "This chat already has a recent snapshot.", es: "Este chat ya tiene una prueba externa reciente." },
  SNAPSHOT_POLICY_BLOCKED: { en: "A prospect snapshot runs only ordinary questions on a website chat, within its limits.", es: "Una prueba externa solo hace preguntas normales a un chat web, dentro de sus límites." },

  // Sign-up and invitations.
  SIGNUP_UNAVAILABLE: { en: "This sign-up link cannot be used. Request a new one.", es: "Este enlace de registro no se puede usar. Pide uno nuevo." },
  SIGNUP_DOMAIN_TAKEN: { en: "Someone at your company already created a Caudals workspace. Ask its owner to invite you.", es: "Alguien de tu empresa ya ha creado un espacio de trabajo en Caudals. Pide a su propietario que te invite." },
  WORK_EMAIL_REQUIRED: { en: "Use your work email.", es: "Usa tu correo de trabajo." },
  TERMS_REQUIRED: { en: "Accept the Terms of Service and the Privacy Policy to create your account.", es: "Acepta los Términos del servicio y la Política de privacidad para crear tu cuenta." },
  INVITATION_UNAVAILABLE: { en: "This invitation is invalid, expired or already used.", es: "Esta invitación no es válida, ha caducado o ya se ha usado." },

  // Client-side codes (no answer from the server).
  NETWORK_ERROR: { en: "Could not reach Caudals. Check your connection and try again.", es: "No se ha podido conectar con Caudals. Comprueba tu conexión y vuelve a intentarlo." },
  UNKNOWN: { en: "Something went wrong. Try again.", es: "Algo ha fallado. Vuelve a intentarlo." },
};

/** Shown, with the code, for a code this table does not know. */
export const API_ERROR_FALLBACK = {
  en: "This action could not be completed (code {code}). Try again, or contact us if it keeps happening.",
  es: "No se ha podido completar esta acción (código {code}). Vuelve a intentarlo o escríbenos si se repite.",
} as const;

/** The page a link to the API shows when it fails (a download opened in the browser). */
export const API_ERROR_PAGE = {
  en: { title: "This could not be opened", back: "Back to Caudals" },
  es: { title: "No se ha podido abrir", back: "Volver a Caudals" },
} as const;

/** "Reference: {id}." after an unexpected failure, so support can find the request. */
export const API_ERROR_REFERENCE = { en: "Reference: {id}.", es: "Referencia: {id}." } as const;

const NUMBER = /^\d{4,}$/;
const PATTERNS = Object.entries(API_PATTERNS_ES).filter(([english]) => english !== PROVIDER_DETAIL).map(([english, spanish]) => {
  const parts = english.split("{}").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return { regex: new RegExp(`^${parts.join("(.*?)")}$`, "s"), spanish };
});

function fill(template: string, slots: string[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index: string) => {
    const value = slots[Number(index)] ?? "";
    return NUMBER.test(value) ? new Intl.NumberFormat("es-ES").format(Number(value)) : value;
  });
}

/** The Spanish for one English sentence the API sends, or null. */
function sentence(message: string): string | null {
  const exact = (Object.hasOwn(API_MESSAGES_ES, message) ? API_MESSAGES_ES[message] : null) ?? serverPhrase(message);
  if (exact) return exact;
  for (const pattern of PATTERNS) {
    const match = pattern.regex.exec(message);
    if (!match) continue;
    const slots = match.slice(1);
    const text = typeof pattern.spanish === "string" ? fill(pattern.spanish, slots) : pattern.spanish(slots, message);
    if (text !== null) return text;
  }
  return null;
}

/** Several sentences (a hint and a detail, or problems joined with spaces): each must have its Spanish. */
function sentences(message: string): string | null {
  const parts = message.replace(/([.!?])\s+(?=[A-Z“"])/g, "$1\n").split("\n");
  if (parts.length < 2) return null;
  const spanish = parts.map(sentence);
  return spanish.every((part) => part !== null) ? spanish.join(" ") : null;
}

/** Our hint in Spanish, then the provider's own words as they came. */
function providerDetail(message: string): string | null {
  for (const match of message.matchAll(/[.!?] /g)) {
    const end = match.index + 1;
    const text = sentence(message.slice(0, end));
    if (text !== null) return `${text} Respuesta del proveedor: «${message.slice(end + 1)}»`;
  }
  return null;
}

/** Spanish for a sentence the server sent, or null when the table does not have it (callers then fall back). */
export function spanishApiMessage(message: string, code = ""): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  return sentence(trimmed) ?? sentences(trimmed) ?? (code === "PROVIDER_UNAVAILABLE" ? providerDetail(trimmed) : null);
}

/** The code's own message, or the generic one with the code. */
export function apiCodeMessage(code: string, locale: "en" | "es" = getLocale()): string {
  if (Object.hasOwn(API_CODES, code)) return API_CODES[code][locale];
  return API_ERROR_FALLBACK[locale].replace("{code}", code || "UNKNOWN");
}

/**
 * What the app shows for an API error: in English the server's sentence; in
 * Spanish its translation, else the code's message, else a generic message
 * with the code. Never an English sentence in Spanish.
 */
export function apiErrorText(code: string, message?: string | null, locale: "en" | "es" = getLocale()): string {
  const text = message?.trim();
  if (locale === "en") return text || apiCodeMessage(code, "en");
  return (text ? spanishApiMessage(text, code) : null) ?? apiCodeMessage(code, "es");
}

/**
 * A sentence from a result the app shows (a connection test): in Spanish its
 * translation, else the provider's own words, quoted as such.
 */
export function apiResultText(message: string, locale: "en" | "es" = getLocale()): string {
  if (locale === "en" || !message.trim()) return message;
  return spanishApiMessage(message) ?? `Respuesta del proveedor: «${message.trim()}»`;
}

/** A short label from the server (a model's detail such as "128k context", or an owner name, which stays as it is). */
export function apiLabelText(label: string, locale: "en" | "es" = getLocale()): string {
  return locale === "es" ? spanishApiMessage(label) ?? label : label;
}
