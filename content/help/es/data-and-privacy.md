---
title: Cómo tratamos tus datos
summary: Dónde se guardan tus datos, qué modelos los leen, cómo se protegen las credenciales, cuánto tiempo se conserva cada cosa y cómo eliminar un espacio.
keywords: [datos, privacidad, rgpd, seguridad, alojamiento, alemania, cifrado, credenciales, conservación, exportar, zip, eliminar, borrado, encargo de tratamiento, subencargados, modelo, adversarias]
related: [team-and-roles, reports-and-sharing, connect-api]
owner: founder
reviewed: 2026-10-12
review_by: 2027-01-12
---

## Dónde se guardan {#hosting}

La aplicación, la base de datos, el almacenamiento de archivos y las copias de seguridad funcionan en servidores que Caudals opera en Hetzner, en Alemania. La base de datos y el almacenamiento de archivos no son accesibles desde internet.

## Qué modelos los leen {#models}

Por defecto, las preguntas las escribe y las respuestas las califica un modelo de IA que funciona en el servidor de GPU propio de Caudals. Tu contenido solo va a un proveedor comercial de IA si tu espacio elige uno. Los espacios gratuitos solo usan los modelos propios de Caudals.

## Credenciales e inicios de sesión {#credentials}

Las claves de API y los tokens son de solo escritura: Caudals los cifra, solo los usa para llamar a tu sistema y no vuelve a mostrarlos. Una sesión que guardas en el navegador en vivo se almacena cifrada y sigue hasta que la revoques; Caudals nunca recibe tu contraseña.

## Qué pregunta Caudals a tu sistema {#questions}

Caudals solo hace las preguntas corrientes de tu conjunto de pruebas. Nunca hace pruebas adversarias, como inyección de instrucciones o intentos de jailbreak, sin tu autorización por escrito.

## Cuánto tiempo se conservan {#retention}

- El contenido del espacio (fuentes, conjuntos de pruebas, ejecuciones e informes) se conserva mientras exista el espacio. Un propietario puede elegir conservar las respuestas de las pruebas 30, 90 o 365 días, en **Ajustes → Datos**; las respuestas en las que se basa un informe que conservas se quedan con ese informe.
- Las capturas de pantalla de comprobaciones web fallidas se borran a los siete días.
- Los resultados de la prueba gratuita de caudals.com se borran a los siete días.
- Las copias de seguridad caducan en aproximadamente una semana.

## Exportar tus datos {#export}

Los propietarios pueden descargarlo todo en **Ajustes → Datos** con **Exportar todos los datos del espacio**: un archivo ZIP con cada informe que conservas (para leer en el navegador, y en JSON y CSV), la evidencia de cada uno, todos los conjuntos de pruebas y las preguntas, respuestas y calificaciones de cada prueba. Se prepara en segundo plano; la descarga funciona durante siete días y después se elimina el archivo.

## Informes compartidos {#sharing}

Tú decides qué sale del espacio. Los enlaces compartidos caducan, y un propietario puede revocarlos en cualquier momento; consulta [Informes, exportaciones y enlaces compartidos](help:reports-and-sharing#revoke). Una copia que alguien ya descargó no se puede recuperar.

## Eliminar un espacio {#delete}

Los propietarios pueden eliminar el espacio en **Ajustes → Zona de peligro** con **Eliminar los datos del espacio**. Indicas un motivo y escribes el nombre del espacio para confirmar. La eliminación revoca al momento cada acceso compartido y cada credencial, detiene las evaluaciones en curso, retira los informes y borra los archivos guardados. No se puede deshacer, y el acceso termina en ese instante para todos los miembros. El espacio se cierra para siempre y se conserva un registro de la eliminación; para que se borren todos los registros restantes, escribe a privacy@caudals.com. Las copias de seguridad cifradas caducan según su calendario habitual, en torno a una semana.

## Documentos legales {#legal}

El [contrato de encargo del tratamiento](https://caudals.com/es/legal/encargo-de-tratamiento) se aplica a todos los espacios sin necesidad de firma; si necesitas una copia firmada, pídenosla. Consulta también las páginas de [subencargados](https://caudals.com/es/legal/subencargados) y [seguridad](https://caudals.com/es/legal/seguridad). Para solicitudes de privacidad, escribe a privacy@caudals.com.
