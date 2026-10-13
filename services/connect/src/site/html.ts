const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text and attribute values. */
export const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, (c) => ENTITIES[c]!);

/** JSON safe to embed in a <script type="application/json"> element. */
export const jsonScript = (id: string, data: unknown): string =>
  `<script type="application/json" id="${id}">${JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
