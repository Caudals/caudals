// Contact data for every card. Profile URLs mirror lib/authors.ts in the main
// app; keep both in sync when a link changes.

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

export interface Person {
  id: string;
  givenName: string;
  familyName: string;
  name: string;
  /** Name as two lines on the card face. */
  cardLines: readonly [string, string];
  email: string;
  /** E.164, no spaces. */
  phone: string;
  phoneDisplay: string;
  linkedin: string;
  github: string;
  role: Readonly<Record<Locale, string>>;
}

export const PEOPLE: readonly Person[] = [
  {
    id: 'mario',
    givenName: 'Mario',
    familyName: 'Medrano Paredes',
    name: 'Mario Medrano Paredes',
    cardLines: ['Mario', 'Medrano Paredes'],
    email: 'mario@caudals.com',
    phone: '+34644321294',
    phoneDisplay: '+34 644 32 12 94',
    linkedin: 'https://www.linkedin.com/in/medpar/',
    github: 'https://github.com/medpar',
    role: { es: 'Cofundador', en: 'Co-founder' },
  },
  {
    id: 'alonso',
    givenName: 'Alonso',
    familyName: 'Sandoval',
    name: 'Alonso Sandoval',
    cardLines: ['Alonso', 'Sandoval'],
    email: 'alonso@caudals.com',
    phone: '+34648957063',
    phoneDisplay: '+34 648 95 70 63',
    linkedin: 'https://www.linkedin.com/in/alonso-sandoval-martinez/',
    github: 'https://github.com/asandova-ui',
    role: { es: 'Cofundador', en: 'Co-founder' },
  },
];

export const ORIGIN = 'https://connect.caudals.com';
export const HOST = 'connect.caudals.com';

export const person = (id: string): Person | undefined => PEOPLE.find((p) => p.id === id);

export const slug = (p: Person): string =>
  p.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const links = {
  /** Language-negotiated permanent link: QR codes, NFC tags and Wallet passes use it. */
  card: (p: Person) => `${ORIGIN}/${p.id}`,
  page: (p: Person, l: Locale) => `/${l}/${p.id}/`,
  vcard: (p: Person, l: Locale) => `/${l}/${p.id}/${slug(p)}.vcf`,
  whatsapp: (p: Person, text?: string) =>
    `https://wa.me/${p.phone.replace(/\D/g, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`,
  tel: (p: Person) => `tel:${p.phone}`,
  mailto: (p: Person) => `mailto:${p.email}`,
  site: (l: Locale) => `https://caudals.com/${l}`,
  companyLinkedin: 'https://www.linkedin.com/company/caudals/',
  call: (l: Locale) => (l === 'es' ? 'https://caudals.com/es/llamada' : 'https://caudals.com/en/call'),
  privacy: (l: Locale) =>
    l === 'es' ? 'https://caudals.com/es/legal/privacidad' : 'https://caudals.com/en/legal/privacy',
};
