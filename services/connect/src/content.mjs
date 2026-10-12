export const origin = 'https://connect.caudals.com';

// Personal profile URLs are maintained in lib/authors.ts; keep these in sync.
export const people = [
  { id: 'mario', first: 'Mario', last: 'Medrano Paredes', number: '01', email: 'mario@caudals.com', phone: '+34644321294', displayPhone: '+34 644 32 12 94', linkedin: 'https://www.linkedin.com/in/medpar/', github: 'https://github.com/medpar' },
  { id: 'alonso', first: 'Alonso', last: 'Sandoval', number: '02', email: 'alonso@caudals.com', phone: '+34648957063', displayPhone: '+34 648 95 70 63', linkedin: 'https://www.linkedin.com/in/alonso-sandoval-martinez/', github: 'https://github.com/asandova-ui' },
];

export const copy = {
  es: {
    lang: 'English', other: 'en', role: 'Cofundador', hello: 'Encantados de conocerte.',
    headline: 'Las buenas ideas empiezan con una', italic: 'conversación.',
    teamHeading: 'Equipo',
    intro: 'Somos Caudals. Evaluamos sistemas de IA y creamos los datos que los hacen mejores.',
    choose: 'Seguimos en contacto', card: 'Ver tarjeta', save: 'Guardar contacto', qr: 'Mi QR',
    email: 'Email', phone: 'Teléfono', whatsapp: 'Hablemos por WhatsApp', linkedin: 'Conectar en LinkedIn',
    about: 'Enseñamos a tu IA a pensar como un experto',
    pitch: 'Evaluamos tu IA, te mostramos dónde falla y creamos con expertos los datos que necesita para mejorar.',
    website: 'Conoce Caudals', companyLinkedin: 'Caudals en LinkedIn', github: 'GitHub',
    team: 'El equipo', share: 'Compartir tarjeta', close: 'Cerrar', scan: 'Un escaneo. Seguimos en contacto.',
    scanSub: 'Abre la cámara de tu móvil y apunta al código.', online: 'Tarjeta completa', offline: 'Sin conexión',
    offlineSub: 'Este QR contiene el nombre, teléfono y email. Se puede escanear sin internet; si tu cámara no lee contactos, usa la tarjeta completa.',
    download: 'Descargar QR', copy: 'Copiar enlace', copied: 'Enlace copiado', copyFailed: 'Selecciona y copia este enlace:',
    shareFailed: 'No se pudo abrir el menú. Puedes copiar el enlace o descargar el QR.',
    home: 'Siempre a mano', homeTitle: 'Tu próxima conversación, a un toque.',
    homeIntro: 'Guarda esta tarjeta en la pantalla de inicio de tu móvil. Ábrela y toca «Mi QR» cuando quieras compartirla.',
    ios: 'iPhone · Safari', iosHelp: 'Toca Compartir en Safari → Añadir a pantalla de inicio.',
    android: 'Android · Chrome', androidHelp: 'Abre el menú ⋮ → Añadir a pantalla de inicio o Instalar aplicación.',
    poorSignal: '¿Poca cobertura?', signalHelp: 'Abre la tarjeta una vez antes del evento para tenerla disponible sin conexión. También puedes descargar el QR y guardarlo en Fotos.',
    nfc: '¿Tienes una tarjeta NFC?', nfcHelp: 'Graba este enlace como dirección web en tu tarjeta o etiqueta NFC. Abrirá siempre esta tarjeta de contacto.',
    privacy: 'Privacidad', contactHint: 'Se abrirá un archivo de contacto para añadirlo a tu agenda.',
    savedQr: 'QR de contacto', noJs: 'Los datos y la descarga del contacto funcionan sin JavaScript. Actívalo para abrir el QR y compartir.',
  },
  en: {
    lang: 'Español', other: 'es', role: 'Co-founder', hello: 'Good to meet you.',
    headline: 'Good ideas start with a', italic: 'conversation.',
    teamHeading: 'Team',
    intro: 'We’re Caudals. We evaluate AI systems and build the data that makes them better.',
    choose: 'Let’s stay in touch', card: 'View card', save: 'Save contact', qr: 'My QR',
    email: 'Email', phone: 'Phone', whatsapp: 'Chat on WhatsApp', linkedin: 'Connect on LinkedIn',
    about: 'We teach your AI to think like an expert.',
    pitch: 'We evaluate your AI, show you where it fails, and work with domain experts to build the data it needs to improve.',
    website: 'Meet Caudals', companyLinkedin: 'Caudals on LinkedIn', github: 'GitHub',
    team: 'The team', share: 'Share card', close: 'Close', scan: 'One scan. Stay in touch.',
    scanSub: 'Open your phone camera and point it at the code.', online: 'Full card', offline: 'Offline contact',
    offlineSub: 'This QR contains the name, phone and email. Scan without internet; if your camera cannot read contacts, use the full card.',
    download: 'Download QR', copy: 'Copy link', copied: 'Link copied', copyFailed: 'Select and copy this link:',
    shareFailed: 'The share menu could not open. Copy the link or download the QR instead.',
    home: 'Keep it handy', homeTitle: 'Your next conversation, one tap away.',
    homeIntro: 'Add this card to your phone’s home screen. Open it and tap “My QR” whenever you want to share it.',
    ios: 'iPhone · Safari', iosHelp: 'Tap Share in Safari → Add to Home Screen.',
    android: 'Android · Chrome', androidHelp: 'Open the ⋮ menu → Add to Home screen or Install app.',
    poorSignal: 'Poor reception?', signalHelp: 'Open the card once before the event so it is available offline. You can also download the QR and keep it in Photos.',
    nfc: 'Have an NFC card?', nfcHelp: 'Write this link as a web address to your NFC card or tag. It will always open this contact card.',
    privacy: 'Privacy', contactHint: 'A contact file will open so you can add it to your address book.',
    savedQr: 'Contact QR', noJs: 'Contact details and the contact download work without JavaScript. Enable it to open the QR and share.',
  },
};

export function vcard(person, compact = false) {
  const escape = value => value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escape(person.last)};${person.first};;;`, `FN:${person.first} ${person.last}`, 'ORG:Caudals', `${compact ? 'TEL' : 'TEL;TYPE=CELL'}:${person.phone}`, `${compact ? 'EMAIL' : 'EMAIL;TYPE=INTERNET,WORK'}:${person.email}`];
  if (!compact) lines.push(`URL:${origin}/${person.id}`, 'TITLE:Co-founder', 'item1.URL:' + person.linkedin, 'item1.X-ABLabel:LinkedIn', 'item2.URL:https://wa.me/' + person.phone.slice(1), 'item2.X-ABLabel:WhatsApp', 'item3.URL:https://caudals.com', 'item3.X-ABLabel:Caudals', 'item4.URL:' + person.github, 'item4.X-ABLabel:GitHub');
  lines.push('END:VCARD');
  // vCard 3.0 line folding, measured in UTF-8 octets (RFC 2425).
  return lines.map(line => {
    let folded = '', width = 0;
    for (const char of line) {
      const bytes = Buffer.byteLength(char);
      if (width + bytes > 75) { folded += '\r\n '; width = 1; }
      folded += char; width += bytes;
    }
    return folded;
  }).join('\r\n') + '\r\n';
}
