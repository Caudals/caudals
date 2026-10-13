import type { Locale, Person } from '../data/people.ts';
import { links } from '../data/people.ts';

const ABOUT: Record<Locale, string> = {
  es: 'Caudals evalúa asistentes de IA y crea los datos que los mejoran. caudals.com',
  en: 'Caudals evaluates AI assistants and builds the data that makes them better. caudals.com',
};

const CARD_LABEL: Record<Locale, string> = { es: 'Tarjeta', en: 'Card' };

/** Escapes a vCard 3.0 text value (RFC 2426 §5). */
export const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

/** Folds a content line at 75 octets, continuation lines start with one space. */
export function fold(line: string): string {
  const encoder = new TextEncoder();
  let out = '';
  let width = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (width + bytes > 75) {
      out += '\r\n ';
      width = 1;
    }
    out += char;
    width += bytes;
  }
  return out;
}

const finish = (lines: string[]): string => lines.map(fold).join('\r\n') + '\r\n';

export interface VCardOptions {
  /** Base64 PNG shown as the contact picture. */
  photo?: string;
  revision?: string;
}

/** Full contact for the "Save contact" button. */
export function fullVCard(p: Person, locale: Locale, options: VCardOptions = {}): string {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'PRODID:-//Caudals//Connect//EN',
    `N:${escapeText(p.familyName)};${escapeText(p.givenName)};;;`,
    `FN:${escapeText(p.name)}`,
    'ORG:Caudals',
    `TITLE:${escapeText(p.role[locale])}`,
    `TEL;TYPE=CELL,VOICE,pref:${p.phone}`,
    `EMAIL;TYPE=INTERNET,WORK,pref:${p.email}`,
    `item1.URL:${links.card(p)}`,
    `item1.X-ABLabel:${CARD_LABEL[locale]}`,
    'item2.URL:https://caudals.com',
    'item2.X-ABLabel:Caudals',
    `item3.URL:${p.linkedin}`,
    'item3.X-ABLabel:LinkedIn',
    `item4.URL:${links.whatsapp(p)}`,
    'item4.X-ABLabel:WhatsApp',
    `item5.URL:${p.github}`,
    'item5.X-ABLabel:GitHub',
    `X-SOCIALPROFILE;TYPE=linkedin:${p.linkedin}`,
    `NOTE:${escapeText(ABOUT[locale])}`,
  ];
  if (options.photo) lines.push(`PHOTO;ENCODING=b;TYPE=PNG:${options.photo}`);
  if (options.revision) lines.push(`REV:${options.revision}`);
  lines.push('END:VCARD');
  return finish(lines);
}

/** Minimal contact that fits a scannable QR and saves without internet. */
export function compactVCard(p: Person, locale: Locale): string {
  return finish([
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escapeText(p.familyName)};${escapeText(p.givenName)}`,
    `FN:${escapeText(p.name)}`,
    'ORG:Caudals',
    `TITLE:${escapeText(p.role[locale])}`,
    `TEL;TYPE=CELL:${p.phone}`,
    `EMAIL:${p.email}`,
    `URL:${links.card(p)}`,
    'END:VCARD',
  ]);
}
