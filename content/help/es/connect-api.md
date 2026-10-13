---
title: Conectar una API
summary: Prueba un asistente a través de un endpoint HTTPS compatible con OpenAI, con una clave opcional que Caudals guarda cifrada y no vuelve a mostrar.
keywords: [api, endpoint, openai, compatible, chat completions, https, clave de api, token, bearer, cabecera, credenciales, red privada, ejecutor]
related: [connect-website-chat, data-and-privacy, prepare-and-run]
owner: engineering
reviewed: 2026-10-12
review_by: 2027-01-12
---

Si tu asistente tiene una API que acepta peticiones de chat en el formato de OpenAI, Caudals puede enviarle cada pregunta directamente.

## Añadir la API {#add}

1. Ve a **Evaluaciones** y elige **Nueva evaluación**.
2. En **¿Cómo accede Caudals al sistema?**, elige **API**.
3. Rellena los tres campos de abajo y elige **Crear evaluación**.

- **Endpoint HTTPS de la API**: la dirección completa que recibe las peticiones de chat. En la mayoría de proveedores termina en `/chat/completions`, por ejemplo `https://api.example.com/v1/chat/completions`.
- **Nombre del modelo o despliegue**: el valor que Caudals envía como `model`.
- **Clave de API (opcional)**: se envía como token bearer.

La dirección tiene que ser pública y usar HTTPS. Caudals lo comprueba antes de guardarla.

## Qué envía Caudals {#requests}

Para cada pregunta, Caudals envía una petición `POST` con un cuerpo JSON que contiene `model`, `messages` (tu pregunta como mensaje del usuario) y `"stream": false`, y lee la respuesta en `choices[0].message.content`.

- Una petición cada vez, unas seis por minuto.
- Cada petición espera hasta dos minutos una respuesta.
- Las llamadas a tu API las factura tu propio proveedor, no Caudals.

## Claves y otras cabeceras {#credentials}

Para usar una cabecera distinta de `Authorization`, o para cambiar una clave, abre el sistema en **Sistemas** y ve a **Credenciales**. Indica una etiqueta, el nombre de la cabecera y la clave o el token.

Los valores son de solo escritura. Caudals los cifra, no vuelve a mostrarlos y solo los usa al llamar a este sistema. Guardar o rotar una clave crea una versión nueva del sistema, así que los resultados anteriores siguen ligados a la versión que usaron.

## Si tu sistema no está en internet {#private}

Para un sistema dentro de tu propia red, Caudals tiene un ejecutor privado: una herramienta de línea de comandos que ejecutas dentro de tu red, que descarga las preguntas y devuelve las respuestas, solo con conexiones salientes. Caudals lo habilita por espacio y no forma parte del plan gratuito. [Pídenoslo](help:getting-help) si lo necesitas.

Otros formatos de API aún no están disponibles. Si tu asistente no responde en el formato de OpenAI, puedes evaluarlo [subiendo sus respuestas](help:uploads#answers), donde esa opción esté habilitada.
