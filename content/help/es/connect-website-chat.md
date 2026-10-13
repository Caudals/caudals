---
title: Conectar un chat web
summary: Indica a Caudals la página donde se abre tu chat y, si la comprobación automática necesita ayuda, revisa la conexión en un navegador en vivo.
keywords: [web, chat, chatbot, widget, conectar, conexión, navegador en vivo, inicio de sesión, login, captcha, reparar]
related: [connect-api, prepare-and-run, data-and-privacy]
owner: operations
reviewed: 2026-10-12
review_by: 2027-01-12
---

Caudals puede hacer tus preguntas a través de la misma ventana de chat que usan tus clientes, en tu web pública o detrás de un inicio de sesión.

## Añadir el chat {#add}

1. Ve a **Evaluaciones** y elige **Nueva evaluación**.
2. En **¿Cómo accede Caudals al sistema?**, elige **Chatbot web**.
3. Escribe la **URL del sitio web** de una página donde se abra el chat. Usa una dirección `https://`.
4. Elige **Crear evaluación**.

Después, Caudals comprueba la conexión por su cuenta: abre la página en un navegador nuevo, busca la caja del chat, envía un mensaje de prueba y lee la respuesta. Mientras tanto, el sistema muestra **Comprobando la conexión**.

## Cuando la comprobación te necesita {#live-browser}

Algunos chats necesitan un clic para abrirse, un inicio de sesión o un CAPTCHA. Entonces el sistema muestra **Necesita ayuda**, y un propietario del espacio puede resolverlo:

1. Abre el paso de conexión de la evaluación (o el sistema en **Sistemas**) y elige **Abrir navegador en vivo**.
2. Tú controlas ese navegador. Inicia sesión, completa el inicio de sesión único, la verificación en dos pasos o el CAPTCHA, y abre el chat si necesita un clic. Caudals nunca se salta un CAPTCHA por su cuenta.
3. Elige **Conectar sistema**. Caudals busca la caja del chat, envía un mensaje de prueba, lee la respuesta, recarga la página y repite la prueba en sesiones nuevas.
4. Si no encuentra algún elemento, usa **Corregir** junto a él en **Qué usa Caudals** (la caja de mensajes, el botón de enviar, la respuesta…) y después **Probar de nuevo**.

Cuando la prueba sale bien verás **Conectada**. Si iniciaste sesión, la sesión se guarda cifrada y sigue hasta que la revoques. Caudals nunca recibe tu contraseña.

El navegador en vivo se cierra tras 20 minutos sin actividad o dos horas en total. Tu conexión guardada se mantiene y puedes volver a abrirlo cuando quieras.

## Durante una ejecución {#during-run}

Caudals hace una pregunta cada vez, unas seis por minuto, y espera la respuesta completa, para no saturar tu chat.

Si tu web cambia, la sesión caduca o la web alcanza un límite de uso, la ejecución se pausa en lugar de registrar respuestas erróneas. Repara la conexión con **Reparar conexión** y después reanuda la ejecución, termínala con las respuestas capturadas hasta ese momento o empieza una nueva. Consulta [Preparar y ejecutar tus pruebas](help:prepare-and-run#run).

## Conviene saber {#notes}

- Solo los propietarios pueden abrir el navegador en vivo. Los editores pueden ejecutar evaluaciones cuando el chat ya está conectado.
- Caudals solo envía las preguntas corrientes de tu conjunto de pruebas. Nunca hace pruebas adversarias sin tu autorización por escrito.
- Las capturas de pantalla tomadas cuando falla una comprobación se conservan siete días.
