---
title: Subir documentos y respuestas
summary: Añade el material de referencia con el que se escriben tus pruebas y, donde esté habilitado, sube las respuestas de tu sistema en lugar de conectarlo.
keywords: [subir, archivo, documento, pdf, word, excel, csv, material de referencia, fuentes, web, páginas, respuestas, hoja de cálculo, escaneado, arrastrar, centro de ayuda, sitemap, contexto]
related: [prepare-and-run, connect-api, data-and-privacy]
owner: operations
reviewed: 2026-10-13
review_by: 2027-01-13
---

Tus pruebas se escriben a partir de tu propio material. Puedes añadir archivos, páginas web públicas o ambas cosas.

## Documentos de referencia {#documents}

En el paso de preparación de la evaluación, en **Material de referencia**:

- Suelta archivos PDF, Word, TXT, Markdown, CSV o Excel en la zona de subida, o elígelos: hasta 50 archivos, de 25 MB cada uno y 200 MB en total por evaluación. Los PDF pueden tener hasta 500 páginas. Cada archivo muestra su propio progreso; un archivo que ya está en la evaluación se omite y uno que no se puede añadir explica por qué sin detener los demás.
- Elige **Importar centro de ayuda** y pega la dirección de tu centro de ayuda o de su sitemap. Caudals primero lista las páginas, a partir del sitemap, solo de ese sitio y respetando su robots.txt; tú eliges cuáles leer (hasta 50 páginas en el plan gratuito y 200 con créditos) y ves los créditos que consumirá, uno por página leída.
- Elige **Añadir un sitio web público** para leer hasta 25 páginas públicas de ese dominio. Caudals no inicia sesión, no envía formularios ni sigue enlaces a otros dominios.
- Elige **Buscar fuentes en internet** para recibir hasta diez páginas públicas sugeridas sobre tu producto, como páginas de ayuda, preguntas frecuentes, condiciones y precios. Primero aparecen las de tu propia web. Elige cuáles añadir.

Puedes abrir cada fuente para comprobar el texto que ha extraído Caudals.

## Documentos escaneados {#scanned}

Caudals lee el texto de un archivo; no lee imágenes de texto. Un PDF casi sin texto, o con más de la mitad de sus páginas vacías, se marca como **Parece un documento escaneado** en cuanto se lee. Sube una versión con texto (un PDF exportado o el Word original) o la página web equivalente, o déjalo fuera. El resto de tu material no se ve afectado.

## Confirma lo que hemos entendido {#context}

Antes de escribir las pruebas, Caudals muestra **Lo que hemos entendido de tu asistente**: para qué sirve, quién lo usa, sus tareas principales, idiomas, jurisdicción, fecha de referencia, qué fuente manda cuando no coinciden, lo que no debe hacer y las preguntas abiertas. Los campos marcados con **Revísalo** no estaban claros en tu material; **Ver de dónde sale** abre los fragmentos de cada campo. Corrige lo que no sea correcto y elige **Confirmar y escribir las pruebas**; es gratis. Si lo omites, o nadie lo confirma en 30 minutos, las pruebas usan lo que Caudals ha entendido y el informe indica que el contexto no se confirmó.

## Subir las respuestas de tu sistema {#answers}

Cuando Caudals no puede acceder a tu sistema, puedes hacerle tú las preguntas y subir las respuestas. Esta opción, **Subir respuestas**, aparece al crear una evaluación si está habilitada en tu espacio; no forma parte del plan gratuito.

1. Prepara y aprueba el conjunto de pruebas como siempre.
2. Inicia la ejecución. La evaluación muestra **Esperando tus respuestas**.
3. Elige **Descargar hoja de preguntas**. Haz cada pregunta a tu sistema y pega su respuesta en la columna `system_answer`. Deja el resto de columnas como están.
4. Sube la hoja en CSV, JSONL o Excel (hasta 25 MB).

Las subidas parciales se guardan, así que puedes enviar las respuestas en varias tandas. Cuando todas las preguntas tienen respuesta, Caudals las califica y tu informe preliminar está listo.
