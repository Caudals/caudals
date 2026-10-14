---
title: Programaciones y alertas de regresión
summary: Repite un conjunto de pruebas aprobado cada semana o cada mes, consulta lo que cuesta y recibe una alerta cuando las respuestas empeoran respecto a la ejecución anterior.
keywords: [programación, ejecuciones programadas, monitorización, periódica, mensual, semanal, diaria, regresión, alerta, comparar, volver a ejecutar, omitida, webhook, notificación, slack, teams, correo, ci, pipeline, github actions, control de publicación, umbral, token de api]
related: [prepare-and-run, reading-results, getting-help]
owner: engineering
reviewed: 2026-10-14
review_by: 2027-01-14
---

Una programación vuelve a ejecutar el mismo conjunto de pruebas congelado a una hora fija, para que veas si un cambio en tu asistente, su modelo o sus documentos ha empeorado las respuestas.

## Crear una programación {#create}

Las programaciones están en **Ajustes → Monitorización**, en **Ejecuciones programadas**. Los propietarios pueden crearlas para evaluaciones con un conjunto de pruebas aprobado. La programación forma parte del pago por uso y de los planes gestionados, no del plan gratuito.

1. Elige **Nueva programación**.
2. Elige la evaluación y el sistema que se va a probar.
3. Indica la frecuencia, el día, la hora local y la zona horaria. Los espacios de trabajo con créditos programan ejecuciones **Semanales** o **Mensuales**; los planes gestionados también pueden elegir **Diaria**.
4. Con créditos, el diálogo muestra la **estimación**: créditos por ejecución y al mes. Los propietarios pueden fijar un **Límite de créditos al mes**, lo máximo que pueden usar las ejecuciones de la programación en un mes natural. En un plan gestionado indicas un **Gasto máximo por ejecución**.
5. Si quieres, indica una **Antigüedad máxima de las fuentes (días)**. Cuando tus fuentes son más antiguas, la ejecución programada se omite en lugar de probar con material desactualizado.

Cada programación se puede pausar y reanudar. Cuando existe un conjunto aprobado más reciente, **Usar el conjunto aprobado** cambia la programación a ese conjunto. Los propietarios cambian el límite de créditos de una programación desde su menú.

## Cuándo se omite una ejecución programada {#skipped}

Antes de que empiece cada ejecución programada, Caudals comprueba que el saldo cubre su estimación y que no supera el límite de la programación ni los de tu espacio de trabajo. Si no, esa ejecución se omite, no se cobra nada y los propietarios reciben un aviso en la aplicación y por correo con lo que conviene hacer antes de la siguiente: añadir créditos o subir el límite. La programación sigue activa. Las ejecuciones se cobran como cualquier otra: solo el trabajo completado.

## Cómo se juzga cada resultado {#outcomes}

Cada ejecución programada se compara, pregunta por pregunta, con la ejecución completada anterior de la misma programación:

- **Superada**: ninguna pregunta ha empeorado.
- **Regresión**: al menos una pregunta tiene una etiqueta peor que antes, por ejemplo correcta antes e incorrecta ahora.
- **No concluyente**: las ejecuciones no se pueden comparar con justicia, por ejemplo en la primera ejecución, cuando se puntuó menos del 90 % de las pruebas o cuando mejoraron tantas preguntas como empeoraron.
- **Desconocido**: la ejecución falló o se canceló.

Las ejecuciones con otro conjunto de pruebas (o con otra rúbrica, otro corrector u otra configuración de conexión) **no son comparables**: nunca se ponen sus puntuaciones lado a lado y no se envía ninguna alerta de regresión.

## Dónde aparecen las alertas {#alerts}

Los resultados aparecen en **Resultados de la monitorización**, con la puntuación frente a la vez anterior, y en el centro de notificaciones con las preguntas que han empeorado. Una regresión también se envía por correo a quienes tienen activado **Regresiones** en **Ajustes → Notificaciones**: la puntuación de esta vez y de la anterior, y hasta cinco preguntas que han empeorado, cada una con un enlace a su respuesta. Para enviar los resultados a un canal del equipo o a tus propios sistemas, añade un destino en **Ajustes → Desarrolladores** (abajo).

## Slack, Teams y correo {#destinations}

En **Ajustes → Desarrolladores → Destinos de alertas**, los propietarios eligen **Añadir destino** y un tipo:

- **Slack**: en Slack, añade la aplicación Incoming Webhooks al canal y pega la URL del webhook que te da (`https://hooks.slack.com/services/…`).
- **Microsoft Teams**: en Teams, crea un flujo de trabajo con la plantilla «Publicar en un canal cuando se reciba una solicitud de webhook» y pega su URL.
- **Correo electrónico**: la dirección de una persona del equipo o una dirección del dominio de tu empresa, como un buzón compartido de alertas.
- **Webhook firmado**: un evento JSON firmado con HMAC para tus propios sistemas; la referencia de la API explica cómo verificarlo.

Elige si quieres enterarte de las **regresiones y ejecuciones que no han podido terminar** o de **todas las ejecuciones programadas**, y el idioma de los mensajes. Slack, Teams y el correo reciben un mensaje legible: la puntuación frente a la última vez, hasta cinco preguntas que han empeorado con enlaces a sus respuestas y un enlace al informe. **Enviar prueba** manda un ejemplo, marcado como tal, para que compruebes que llega; el resultado aparece en el destino. Las URL de los webhooks y las direcciones se guardan cifradas, solo se aceptan direcciones públicas de internet y un destino eliminado deja de recibir mensajes en el acto.

## Controlar publicaciones desde tu pipeline {#ci}

Un pipeline de despliegue puede ejecutar tu conjunto de pruebas aprobado antes de cada publicación y detenerla cuando las respuestas empeoran:

1. En **Ajustes → Desarrolladores**, crea un token con **Pipeline de CI: iniciar ejecuciones y leer sus resultados**. Elige una caducidad corta y guárdalo como secreto en tu CI.
2. En **Control de publicación**, fija el **umbral de aprobado**: el porcentaje de respuestas puntuadas que deben pasar en ese conjunto de pruebas. Una programación puede fijar el suyo desde su menú, que sustituye al del conjunto para sus ejecuciones.
3. Tu pipeline inicia una ejecución con la versión del conjunto de pruebas y la del sistema que aparecen ahí y una `Idempotency-Key`, y pregunta al control hasta que responde **pass**, **fail** o **unknown** (la ejecución no ha podido dar un resultado). La referencia de la API tiene un ejemplo con curl y un flujo de GitHub Actions.

Las ejecuciones iniciadas así cuentan como cualquier otra: se aplican la estimación, tus límites de créditos y tu plan, y cada clave inicia una sola ejecución por muchas veces que se reintente.

## Volver a ejecutar y comparar {#compare}

En los resultados de una evaluación, **Volver a ejecutar** repite el mismo conjunto de pruebas aprobado (primero con su estimación si tu espacio de trabajo paga con créditos). Cuando termina la nueva ejecución, la comparación con la anterior se abre sola: preguntas que mejoran, empeoran o no cambian, cada una con su respuesta. **Comparar** te deja elegir otra ejecución anterior. En un informe, **Volver a ejecutar estas preguntas** en una corrección hace lo mismo y muestra primero las preguntas de esa corrección.
