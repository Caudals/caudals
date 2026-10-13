---
title: Subir documentos y respuestas
summary: Añade el material de referencia con el que se escriben tus pruebas y, donde esté habilitado, sube las respuestas de tu sistema en lugar de conectarlo.
keywords: [subir, archivo, documento, pdf, word, excel, csv, material de referencia, fuentes, web, páginas, respuestas, hoja de cálculo, escaneado]
related: [prepare-and-run, connect-api, data-and-privacy]
owner: operations
reviewed: 2026-10-12
review_by: 2027-01-12
---

Tus pruebas se escriben a partir de tu propio material. Puedes añadir archivos, páginas web públicas o ambas cosas.

## Documentos de referencia {#documents}

En el paso de preparación de la evaluación, en **Material de referencia**:

- Sube archivos PDF, Word, TXT, Markdown, CSV o Excel: hasta 20 archivos, de 25 MB cada uno y 100 MB en total por evaluación. Los PDF pueden tener hasta 500 páginas.
- Elige **Añadir un sitio web público** para leer hasta 25 páginas públicas de ese dominio. Caudals no inicia sesión, no envía formularios ni sigue enlaces a otros dominios.
- Elige **Buscar fuentes en internet** para recibir hasta diez páginas públicas sugeridas sobre tu producto, como páginas de ayuda, preguntas frecuentes, condiciones y precios. Primero aparecen las de tu propia web. Elige cuáles añadir.

Puedes abrir cada fuente para comprobar el texto que ha extraído Caudals.

## Documentos escaneados {#scanned}

Caudals lee el texto de un archivo; no lee imágenes de texto. Si un PDF es un escaneo, verás que no se ha podido leer un documento. Sube una copia con texto seleccionable o el Word original.

## Subir las respuestas de tu sistema {#answers}

Cuando Caudals no puede acceder a tu sistema, puedes hacerle tú las preguntas y subir las respuestas. Esta opción, **Subir respuestas**, aparece al crear una evaluación si está habilitada en tu espacio; no forma parte del plan gratuito.

1. Prepara y aprueba el conjunto de pruebas como siempre.
2. Inicia la ejecución. La evaluación muestra **Esperando tus respuestas**.
3. Elige **Descargar hoja de preguntas**. Haz cada pregunta a tu sistema y pega su respuesta en la columna `system_answer`. Deja el resto de columnas como están.
4. Sube la hoja en CSV, JSONL o Excel (hasta 25 MB).

Las subidas parciales se guardan, así que puedes enviar las respuestas en varias tandas. Cuando todas las preguntas tienen respuesta, Caudals las califica y tu informe preliminar está listo.
