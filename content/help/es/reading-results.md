---
title: Leer tus resultados
summary: Qué significan la puntuación, las etiquetas, el intervalo y las marcas de revisión, y cómo leer un hallazgo y un resultado concreto.
keywords: [resultados, puntuación, tasa de acierto, puntuación de calidad, intervalo, etiquetas, correcta, incorrecta, parcialmente correcta, sin respuesta, sin puntuar, preliminar, revisado, incompleto, hallazgos, causa probable, recalificar]
related: [reports-and-sharing, prepare-and-run, getting-help]
owner: founder
reviewed: 2026-10-12
review_by: 2027-01-12
---

Cuando termina una ejecución, la evaluación muestra un resumen, y el informe completo se abre con **Ver todas las respuestas**.

## La puntuación {#score}

- **N de M respuestas correctas**: M cuenta solo las respuestas puntuadas.
- **Tasa de acierto estricta**: el mismo recuento en porcentaje.
- **Puntuación de calidad**: suma además medio punto por cada respuesta parcialmente correcta.
- **Intervalo del 95 %**: el margen en el que probablemente estaría la tasa de acierto con más preguntas del mismo tipo. Cuantas menos preguntas, más ancho es.

## Las etiquetas {#labels}

- **Correcta**: transmite todos los datos clave y no contradice nada.
- **Parcialmente correcta**: algunos datos clave y ninguno contradicho.
- **Incorrecta**: información errónea o contradictoria, u omite datos clave.
- **Sin respuesta**: el asistente se desvió, pidió reformular o respondió otra cosa.

Los resultados **Sin puntuar** nunca bajan la puntuación: **Prueba en revisión** (la pregunta o su respuesta esperada pueden estar mal), **No capturada** (no se pudo leer la respuesta con fiabilidad) y **No ejecutada** (un tiempo de espera agotado o un error).

Las respuestas se califican por su significado, no por su redacción. Los detalles que tu material no menciona no penalizan; solo penalizan las contradicciones y los datos clave que faltan.

## Marcas {#badges}

- **Preliminar**: calificado automáticamente. **Revisado**: una persona de Caudals ha comprobado los resultados.
- **Incompleto**: se pudo puntuar menos del 90 % de las pruebas, o no se pudo evaluar una prueba crítica. Lee las limitaciones antes de usar la puntuación.
- **Parcial**: la ejecución terminó antes de responder todas las preguntas.

## El informe {#report}

El informe tiene hasta cinco pestañas: **Resumen**, **Hallazgos**, **Resultados de las pruebas**, **Mejoras** y **Metodología**.

Cada hallazgo agrupa respuestas fallidas según lo que salió mal, con lo observado, una acción recomendada y su evidencia. Las **Causas probables** (respuesta inventada, documento desactualizado, fuente equivocada, laguna de conocimiento, fuera de alcance) son hipótesis: Caudals ve las respuestas y tu material, no el funcionamiento interno de tu sistema.

Abre cualquier resultado para ver la pregunta, la respuesta de tu sistema, la respuesta esperada, cada dato clave marcado como incluido, ausente o contradicho, y el fragmento de tu documentación. Usa las flechas del teclado para pasar de un resultado a otro y Esc para volver.

## Volver a calificar {#regrade}

Si cambió tu material o el evaluador, los propietarios y editores pueden elegir **Volver a calificar**. Caudals califica de nuevo las mismas respuestas sin contactar con tu sistema, mantiene todas las decisiones que tomó una persona y publica una versión nueva del informe.

Para el método completo, consulta la [metodología](https://caudals.com/es/metodologia).
