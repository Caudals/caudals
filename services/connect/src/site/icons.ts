// 24 px line icons drawn for this site: 1.6 stroke, round joins, currentColor.

const svg = (body: string, extra = ''): string =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${extra} xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const icons = {
  contact: svg(
    '<circle cx="10" cy="8.2" r="3.6"/><path d="M3.6 19.6c.9-3.4 3.4-5.2 6.4-5.2 1.6 0 3 .5 4.1 1.4"/><path d="M18.5 13.5v6.4M15.3 16.7h6.4"/>',
  ),
  whatsapp: svg(
    '<path d="M12 3.6a8.4 8.4 0 0 0-7.3 12.6L3.6 20.4l4.3-1.1A8.4 8.4 0 1 0 12 3.6Z"/><path d="M9 8.6c.3-.6.6-.6.9-.6h.4c.2 0 .4.1.5.4l.6 1.5c.1.3 0 .5-.1.7l-.5.6c-.1.2-.1.3 0 .5a6.4 6.4 0 0 0 2.6 2.4c.2.1.4.1.5-.1l.6-.6c.2-.2.4-.2.7-.1l1.5.7c.3.1.4.3.4.5v.4c0 .4-.2.7-.5.9a2.9 2.9 0 0 1-2.2.4c-2.6-.6-4.6-2.6-5.2-5.1-.2-.8 0-1.6.3-2.3Z"/>',
  ),
  phone: svg(
    '<path d="M5.6 3.8h2.6l1.5 4-2 1.3a10.6 10.6 0 0 0 5.2 5.2l1.3-2 4 1.5v2.6a2 2 0 0 1-2.2 2A15.9 15.9 0 0 1 3.6 6a2 2 0 0 1 2-2.2Z"/>',
  ),
  mail: svg('<rect x="3.4" y="5.4" width="17.2" height="13.2" rx="2.4"/><path d="m4 7 8 6 8-6"/>'),
  linkedin: svg(
    '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.2"/><path d="M8 10.6V16M8 7.8v.1M11.6 16v-5.4M11.6 13c0-1.5.9-2.5 2.2-2.5 1.2 0 2 .8 2 2.4V16"/>',
  ),
  share: svg(
    '<path d="M12 14.4V3.8M8.2 7.4 12 3.6l3.8 3.8"/><path d="M8.6 10.4H7.2a2.2 2.2 0 0 0-2.2 2.2v5.6a2.2 2.2 0 0 0 2.2 2.2h9.6a2.2 2.2 0 0 0 2.2-2.2v-5.6a2.2 2.2 0 0 0-2.2-2.2h-1.4"/>',
  ),
  qr: svg(
    '<rect x="4" y="4" width="6.2" height="6.2" rx="1.2"/><rect x="13.8" y="4" width="6.2" height="6.2" rx="1.2"/><rect x="4" y="13.8" width="6.2" height="6.2" rx="1.2"/><path d="M13.8 13.8h2.4v2.4M20 13.8v.01M13.8 20h.01M17.6 20H20v-2.4"/>',
  ),
  arrow: svg('<path d="M7.4 16.6 16.6 7.4M9 7.4h7.6V15"/>'),
  close: svg('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  send: svg('<path d="M4.4 11.4 19.6 4.4l-5.2 15.2-3-6.2-7-2Z"/><path d="m11.4 13.4 3.4-3.4"/>'),
  motion: svg(
    '<rect x="8.2" y="3.6" width="7.6" height="16.8" rx="2"/><path d="M4.4 8.6a7.6 7.6 0 0 0 0 6.8M19.6 8.6a7.6 7.6 0 0 1 0 6.8"/>',
  ),
  wallet: svg('<rect x="3.6" y="5.6" width="16.8" height="13" rx="2.6"/><path d="M3.6 9.6h16.8M15.6 14.2h1.6"/>'),
  nfc: svg('<path d="M9.2 8.4a5 5 0 0 1 0 7.2M12.4 6a8.4 8.4 0 0 1 0 12M15.6 3.6a11.8 11.8 0 0 1 0 16.8"/><circle cx="6" cy="12" r="1.2"/>'),
  home: svg('<rect x="4" y="4" width="16" height="16" rx="4.2"/><path d="M12 8.4v7.2M8.4 12h7.2"/>'),
  copy: svg('<rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2.2"/><path d="M15.6 8.4V6.6a2.2 2.2 0 0 0-2.2-2.2H6.6a2.2 2.2 0 0 0-2.2 2.2v6.8a2.2 2.2 0 0 0 2.2 2.2h1.8"/>'),
  signal: svg('<path d="M5 18.4v-2.6M9.6 18.4v-5.2M14.4 18.4v-8M19 18.4V7.4"/>'),
  flip: svg('<path d="M4.6 12a7.4 7.4 0 0 1 12.8-5"/><path d="M17.6 3.8V7.2h-3.4"/><path d="M19.4 12a7.4 7.4 0 0 1-12.8 5"/><path d="M6.4 20.2v-3.4h3.4"/>'),
} as const;
