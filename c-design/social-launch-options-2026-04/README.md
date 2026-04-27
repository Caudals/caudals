# Opciones de lanzamiento social de Caudals

Cinco conceptos para el primer post público de Caudals, escritos en español de España y construidos como piezas estáticas de 1080 x 1080 px.

## Archivos

- `index.html`: galería visual con las cinco opciones.
- `styles.css`: layout e ilustraciones siguiendo el sistema visual de Caudals.
- `render-posts.mjs`: exporta cada `.post` a PNG con Playwright.
- `exports/`: PNGs generados.
- `assets/`: copias locales del logo de Caudals para que la carpeta sea portable.

## Opciones

### 01. Puente entre datos e IA

La opción más clara para el lanzamiento principal porque explica las dos partes del negocio en una sola pieza.

Texto sugerido:

> Presentamos Caudals: convertimos datos de empresa en datos preparados para IA.
>
> Muchas empresas tienen información valiosa. Muchos equipos de IA necesitan ejemplos fiables para entrenar y evaluar sus modelos. Caudals conecta esas dos necesidades y gestiona el trabajo que hay en medio: permisos, limpieza, privacidad, calidad y entrega.
>
> Datos útiles. Uso claro. IA que puede avanzar más rápido.

### 02. Activo de empresa

Buena opción para hablar a empresas que pueden tener datos valiosos, aunque no se vean como proveedoras de datos.

Texto sugerido:

> Tu empresa puede tener un activo que aún no está monetizando: sus datos.
>
> Caudals ayuda a transformar información interna en productos de datos para equipos de IA, con revisión de derechos, anonimización, preparación técnica y entrega gestionada.
>
> Sin montar un mercado propio. Sin improvisar el proceso legal, técnico y comercial desde cero.

### 03. Ejemplos para IA

La opción más accesible para una audiencia no técnica porque explica qué es un conjunto de datos en términos sencillos.

Texto sugerido:

> La IA no aprende de la nada. Aprende con ejemplos.
>
> Un conjunto de datos es eso: una colección ordenada de ejemplos que un modelo puede usar para aprender, probarse o mejorar. En Caudals conseguimos esos ejemplos, los limpiamos, revisamos permisos y los entregamos en formatos útiles para equipos de IA.
>
> Nuestro trabajo es convertir información real en material fiable para construir mejores modelos.

### 04. Operaciones de datos

Buena opción cuando interesa reforzar confianza, cumplimiento, privacidad y calidad.

Texto sugerido:

> Entre un archivo bruto y un dato listo para IA hay mucho trabajo.
>
> En Caudals revisamos derechos de uso, limpiamos errores, detectamos información sensible, anonimizamos cuando hace falta, documentamos calidad y entregamos datos preparados para entrenar o evaluar modelos.
>
> Menos fricción operativa. Más confianza para comprar, vender y usar datos.

### 05. Mercado B2B

Buena opción para posicionar Caudals como la futura categoría de mercado B2B de datos para IA.

Texto sugerido:

> Caudals nace para conectar a empresas con datos y equipos que construyen IA.
>
> Las empresas pueden monetizar información que ya poseen. Los equipos de IA pueden acceder a datos más específicos, limpios y con permisos claros. Caudals gestiona la capa operativa que convierte esa relación en un producto usable.
>
> Un mercado B2B para datos de IA, con operaciones gestionadas desde el primer día.

## Exportar

Ejecutar desde la raíz del repositorio:

```bash
node c-design/social-launch-options-2026-04/render-posts.mjs
```
