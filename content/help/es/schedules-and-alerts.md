---
title: Programaciones y alertas de regresión
summary: Repite un conjunto de pruebas aprobado cada día, semana o mes, y recibe una alerta cuando las respuestas empeoran respecto a la ejecución anterior.
keywords: [programación, ejecuciones programadas, monitorización, periódica, mensual, semanal, diaria, regresión, alerta, comparar, webhook, notificación]
related: [prepare-and-run, reading-results, getting-help]
owner: engineering
reviewed: 2026-10-12
review_by: 2027-01-12
---

Una programación vuelve a ejecutar el mismo conjunto de pruebas congelado a una hora fija, para que veas si un cambio en tu asistente, su modelo o sus documentos ha empeorado las respuestas.

## Crear una programación {#create}

Las programaciones están en **Ajustes → Monitorización**, en **Ejecuciones programadas**. Los propietarios pueden crearlas para evaluaciones con un conjunto de pruebas aprobado. La programación se habilita por espacio y no forma parte del plan gratuito.

1. Elige **Nueva programación**.
2. Elige la evaluación y el sistema que se va a probar.
3. Indica la frecuencia (**Diaria**, **Semanal** o **Mensual**), el día, la hora local y la zona horaria.
4. Si quieres, indica un **Gasto máximo por ejecución** y una **Antigüedad máxima de las fuentes (días)**. Cuando tus fuentes son más antiguas, la ejecución programada se omite en lugar de probar con material desactualizado.

Cada programación se puede pausar y reanudar. Cuando existe un conjunto aprobado más reciente, **Usar el conjunto aprobado** cambia la programación a ese conjunto.

## Cómo se juzga cada resultado {#outcomes}

Cada ejecución programada se compara, pregunta por pregunta, con la ejecución completada anterior de la misma programación:

- **Superada**: ninguna pregunta ha empeorado.
- **Regresión**: al menos una pregunta tiene una etiqueta peor que antes, por ejemplo correcta antes e incorrecta ahora.
- **No concluyente**: las ejecuciones no se pueden comparar con justicia, por ejemplo en la primera ejecución, cuando se puntuó menos del 90 % de las pruebas o cuando mejoraron tantas preguntas como empeoraron.
- **Desconocido**: la ejecución falló o se canceló.

## Dónde aparecen las alertas {#alerts}

Los resultados aparecen en **Resultados de la monitorización** y en el centro de notificaciones. Para enviarlos a tus propios sistemas, añade un webhook firmado en **Ajustes → Desarrolladores**; allí tienes la referencia de la API.
