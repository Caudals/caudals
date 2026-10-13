import type { Locale, Person } from './people.ts';

export interface Copy {
  ogLocale: string;
  skip: string;
  switchTo: string;
  switchShort: string;
  roleLine: (p: Person) => string;
  metaTitle: (p: Person) => string;
  metaDescription: (p: Person) => string;
  cardLabel: (p: Person) => string;
  hint: string;
  motion: string;
  save: string;
  whatsapp: string;
  email: string;
  linkedin: string;
  share: string;
  showQr: string;
  shareText: (p: Person) => string;
  copied: string;
  shareFailed: string;
  exchange: { title: string; body: string; cta: string };
  form: {
    title: (p: Person) => string;
    intro: string;
    name: string;
    company: string;
    role: string;
    email: string;
    phone: string;
    web: string;
    message: string;
    messagePlaceholder: string;
    viaWhatsapp: string;
    viaEmail: string;
    note: string;
    forget: string;
    forgotten: string;
    errName: string;
    errContact: string;
    close: string;
  };
  about: { label: string; statement: string; body: string; site: string; call: string };
  footer: { privacy: string; rights: (year: number) => string };
  qr: {
    title: string;
    link: string;
    offline: string;
    linkHint: string;
    offlineHint: string;
    brightness: string;
    close: string;
    label: string;
    tile: string;
  };
  index: { metaTitle: string; metaDescription: string; title: string; body: string; open: string };
  notFound: { title: string; body: string; back: string };
  setup: {
    metaTitle: string;
    title: string;
    intro: string;
    wallet: string;
    walletBody: string;
    addApple: string;
    addGoogle: string;
    walletMissing: string;
    walletUse: string;
    home: string;
    homeBody: string;
    quick: string;
    quickBody: string;
    copyLink: string;
    nfc: string;
    nfcBody: string;
    nfcWrite: string;
    nfcWriting: string;
    nfcDone: string;
    nfcFailed: string;
    offline: string;
    offlineBody: string;
    open: string;
  };
}

const es: Copy = {
  ogLocale: 'es_ES',
  skip: 'Ir al contenido',
  switchTo: 'Read in English',
  switchShort: 'EN',
  roleLine: (p) => `${p.role.es} · Caudals`,
  metaTitle: (p) => `${p.name} · Caudals`,
  metaDescription: (p) =>
    `${p.role.es} de Caudals. Guarda su contacto, escríbele por WhatsApp o envíale tus datos en un toque.`,
  cardLabel: (p) => `Tarjeta de visita de ${p.name}, ${p.role.es.toLowerCase()} de Caudals`,
  hint: 'Arrastra para girarla · Toca para darle la vuelta',
  motion: 'Moverla con el móvil',
  save: 'Guardar contacto',
  whatsapp: 'WhatsApp',
  email: 'Email',
  linkedin: 'LinkedIn',
  share: 'Compartir tarjeta',
  showQr: 'Mostrar código QR',
  shareText: (p) => `Tarjeta de ${p.name} · Caudals`,
  copied: 'Enlace copiado',
  shareFailed: 'No se pudo compartir. Copia el enlace de la barra de direcciones.',
  exchange: {
    title: '¿Seguimos en contacto?',
    body: 'Envíame tus datos por WhatsApp o email y te escribo después del evento.',
    cta: 'Enviarme tus datos',
  },
  form: {
    title: (p) => `Tus datos para ${p.givenName}`,
    intro: 'Solo el nombre es obligatorio. Añade un email o un teléfono para que pueda responderte.',
    name: 'Nombre y apellidos',
    company: 'Empresa',
    role: 'Cargo',
    email: 'Email',
    phone: 'Teléfono',
    web: 'LinkedIn o web',
    message: 'Mensaje',
    messagePlaceholder: '¿En qué estás trabajando?',
    viaWhatsapp: 'Enviar por WhatsApp',
    viaEmail: 'Enviar por email',
    note: 'No pasa por nuestros servidores: se abre WhatsApp o tu correo con el mensaje listo para enviar. Tus datos se recuerdan solo en este dispositivo.',
    forget: 'Olvidar mis datos',
    forgotten: 'Datos borrados de este dispositivo',
    errName: 'Escribe tu nombre.',
    errContact: 'Añade un email o un teléfono.',
    close: 'Cerrar',
  },
  about: {
    label: 'Sobre Caudals',
    statement: 'Enseñamos a tu IA a pensar como un experto.',
    body: 'Detectamos los fallos de tu IA y trabajamos con profesionales de tu sector para crear los datos que los resuelven.',
    site: 'caudals.com',
    call: 'Reservar una llamada',
  },
  footer: { privacy: 'Privacidad', rights: (y) => `© ${y} Caudals` },
  qr: {
    title: 'Escanea para guardar mi contacto',
    link: 'Enlace',
    offline: 'Sin conexión',
    linkHint: 'Abre la cámara del móvil y apunta al código.',
    offlineHint: 'Este código lleva el contacto dentro: se guarda sin internet.',
    brightness: 'Sube el brillo para que se lea antes.',
    close: 'Cerrar',
    label: 'Código QR',
    tile: 'QR',
  },
  index: {
    metaTitle: 'Caudals · Tarjetas de contacto',
    metaDescription: 'Las tarjetas de contacto del equipo de Caudals.',
    title: 'Conecta con Caudals',
    body: 'Evaluamos asistentes de IA y creamos los datos que los mejoran. Elige con quién quieres hablar.',
    open: 'Ver tarjeta',
  },
  notFound: {
    title: 'Esta tarjeta no existe',
    body: 'Puede que el enlace esté incompleto.',
    back: 'Ver las tarjetas de Caudals',
  },
  setup: {
    metaTitle: 'Configurar tarjetas · Caudals',
    title: 'Tu tarjeta, siempre a mano',
    intro: 'Página interna para Mario y Alonso. No está enlazada desde las tarjetas.',
    wallet: 'Apple Wallet',
    walletBody: 'Un pase con tu QR para enseñarlo desde Wallet, el Apple Watch o la pantalla bloqueada.',
    addApple: 'Añadir a Apple Wallet',
    addGoogle: 'Google Wallet',
    walletMissing: 'Pase todavía no generado (npm run wallet).',
    walletUse: 'Para enseñarlo, abre Wallet y toca el pase. Para tenerlo a un gesto: mantén pulsada la pantalla bloqueada → Personalizar → añade el control de Wallet. También aparece en tu Apple Watch.',
    home: 'Pantalla de inicio',
    homeBody: 'Abre tu tarjeta en Safari → Compartir → Añadir a pantalla de inicio. Funciona sin cobertura después de abrirla una vez.',
    quick: 'QR con un gesto',
    quickBody: 'Crea un atajo «Abrir URL» con este enlace y asígnalo al botón de acción o a Ajustes → Accesibilidad → Tocar → Toque posterior. Abre la tarjeta con el QR ya en pantalla.',
    copyLink: 'Copiar enlace',
    nfc: 'Etiqueta NFC',
    nfcBody: 'Graba tu enlace permanente como URL en una pegatina NFC (NTAG213 o NTAG215) con la app NFC Tools y pégala en la funda. Quien acerque su móvil abrirá tu tarjeta.',
    nfcWrite: 'Grabar etiqueta NFC',
    nfcWriting: 'Acerca la etiqueta a la parte trasera del móvil…',
    nfcDone: 'Etiqueta grabada',
    nfcFailed: 'No se pudo grabar la etiqueta',
    offline: 'Sin cobertura',
    offlineBody: 'En la tarjeta, «Mostrar código QR» → «Sin conexión» enseña un código con tu contacto dentro, que se guarda sin internet.',
    open: 'Abrir tarjeta',
  },
};

const en: Copy = {
  ogLocale: 'en_GB',
  skip: 'Skip to content',
  switchTo: 'Leer en español',
  switchShort: 'ES',
  roleLine: (p) => `${p.role.en} · Caudals`,
  metaTitle: (p) => `${p.name} · Caudals`,
  metaDescription: (p) =>
    `${p.role.en} of Caudals. Save the contact, message on WhatsApp or send your details in one tap.`,
  cardLabel: (p) => `Business card of ${p.name}, ${p.role.en.toLowerCase()} of Caudals`,
  hint: 'Drag to turn it · Tap to flip it',
  motion: 'Move it with your phone',
  save: 'Save contact',
  whatsapp: 'WhatsApp',
  email: 'Email',
  linkedin: 'LinkedIn',
  share: 'Share card',
  showQr: 'Show QR code',
  shareText: (p) => `${p.name}'s card · Caudals`,
  copied: 'Link copied',
  shareFailed: 'Sharing failed. Copy the link from the address bar.',
  exchange: {
    title: 'Let’s stay in touch',
    body: 'Send me your details on WhatsApp or by email and I’ll write after the event.',
    cta: 'Send me your details',
  },
  form: {
    title: (p) => `Your details for ${p.givenName}`,
    intro: 'Only your name is required. Add an email or a phone so I can reply.',
    name: 'Full name',
    company: 'Company',
    role: 'Role',
    email: 'Email',
    phone: 'Phone',
    web: 'LinkedIn or website',
    message: 'Message',
    messagePlaceholder: 'What are you working on?',
    viaWhatsapp: 'Send on WhatsApp',
    viaEmail: 'Send by email',
    note: 'Nothing goes through our servers: WhatsApp or your email app opens with the message ready to send. Your details are remembered on this device only.',
    forget: 'Forget my details',
    forgotten: 'Details removed from this device',
    errName: 'Add your name.',
    errContact: 'Add an email or a phone.',
    close: 'Close',
  },
  about: {
    label: 'About Caudals',
    statement: 'We teach your AI to think like an expert.',
    body: 'We find where your AI fails and work with professionals from your sector to create the data that fixes it.',
    site: 'caudals.com',
    call: 'Book a call',
  },
  footer: { privacy: 'Privacy', rights: (y) => `© ${y} Caudals` },
  qr: {
    title: 'Scan to save my contact',
    link: 'Link',
    offline: 'Offline',
    linkHint: 'Open your phone camera and point it at the code.',
    offlineHint: 'This code carries the contact itself: it saves without internet.',
    brightness: 'Turn the brightness up so it scans faster.',
    close: 'Close',
    label: 'QR code',
    tile: 'QR',
  },
  index: {
    metaTitle: 'Caudals · Contact cards',
    metaDescription: 'Contact cards for the Caudals team.',
    title: 'Connect with Caudals',
    body: 'We evaluate AI assistants and build the data that makes them better. Pick who you want to talk to.',
    open: 'View card',
  },
  notFound: {
    title: 'This card does not exist',
    body: 'The link may be incomplete.',
    back: 'See the Caudals cards',
  },
  setup: {
    metaTitle: 'Card setup · Caudals',
    title: 'Your card, always at hand',
    intro: 'Internal page for Mario and Alonso. The cards do not link to it.',
    wallet: 'Apple Wallet',
    walletBody: 'A pass with your QR, ready to show from Wallet, your Apple Watch or the Lock Screen.',
    addApple: 'Add to Apple Wallet',
    addGoogle: 'Google Wallet',
    walletMissing: 'Pass not generated yet (npm run wallet).',
    walletUse: 'To show it, open Wallet and tap the pass. For one-gesture access, touch and hold the Lock Screen → Customize → add the Wallet control. It also shows on your Apple Watch.',
    home: 'Home Screen',
    homeBody: 'Open your card in Safari → Share → Add to Home Screen. It works without signal after the first visit.',
    quick: 'QR in one gesture',
    quickBody: 'Create an “Open URL” shortcut with this link and assign it to the Action button or to Settings → Accessibility → Touch → Back Tap. It opens the card with the QR already on screen.',
    copyLink: 'Copy link',
    nfc: 'NFC tag',
    nfcBody: 'Write your permanent link as a URL record to an NFC sticker (NTAG213 or NTAG215) with the NFC Tools app and stick it on your phone case. Anyone who taps it opens your card.',
    nfcWrite: 'Write NFC tag',
    nfcWriting: 'Hold the tag against the back of your phone…',
    nfcDone: 'Tag written',
    nfcFailed: 'Could not write the tag',
    offline: 'No signal',
    offlineBody: 'On the card, “Show QR code” → “Offline” shows a code that carries your contact and saves without internet.',
    open: 'Open card',
  },
};

export const COPY: Readonly<Record<Locale, Copy>> = { es, en };
