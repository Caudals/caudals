// Builds the message a visitor sends to the card owner over WhatsApp or email.
// Pure and dependency-free so the page and the tests share it.

export type MessageLocale = 'es' | 'en';

export interface Visitor {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  web?: string;
  message?: string;
}

export interface Owner {
  id: string;
  givenName: string;
  email: string;
  phone: string;
}

export interface Composed {
  subject: string;
  text: string;
  whatsappUrl: string;
  mailtoUrl: string;
}

const clean = (value: string | undefined, max = 280): string =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

const T = {
  es: {
    hello: (owner: string) => `Hola, ${owner}. `,
    iam: (name: string) => `Soy ${name}`,
    roleAt: (role: string, company: string) => `, ${role} en ${company}`,
    from: (company: string) => ` de ${company}`,
    nice: 'Un placer conocerte.',
    details: 'Mis datos:',
    email: 'Email',
    phone: 'Teléfono',
    web: 'LinkedIn o web',
    sent: 'Enviado desde',
    subject: 'Nos conocimos',
  },
  en: {
    hello: (owner: string) => `Hi ${owner}, `,
    iam: (name: string) => `I'm ${name}`,
    roleAt: (role: string, company: string) => `, ${role} at ${company}`,
    from: (company: string) => ` from ${company}`,
    nice: 'Great to meet you.',
    details: 'My details:',
    email: 'Email',
    phone: 'Phone',
    web: 'LinkedIn or website',
    sent: 'Sent from',
    subject: 'We met',
  },
} as const;

export function composeMessage(
  locale: MessageLocale,
  owner: Owner,
  visitor: Visitor,
  date: Date = new Date(),
  host = 'connect.caudals.com',
): Composed {
  const t = T[locale];
  const name = clean(visitor.name, 120);
  const company = clean(visitor.company, 120);
  const role = clean(visitor.role, 120);
  const email = clean(visitor.email, 200);
  const phone = clean(visitor.phone, 40);
  const web = clean(visitor.web, 300);
  const note = (visitor.message ?? '').trim().slice(0, 1200);

  let intro = t.hello(owner.givenName) + t.iam(name);
  if (role && company) intro += t.roleAt(role, company);
  else if (role) intro += `, ${role}`;
  else if (company) intro += t.from(company);
  intro += `. ${t.nice}`;

  const details = [
    email && `${t.email}: ${email}`,
    phone && `${t.phone}: ${phone}`,
    web && `${t.web}: ${web}`,
  ].filter(Boolean) as string[];

  const day = new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);

  const blocks = [intro];
  if (details.length) blocks.push([t.details, ...details].join('\n'));
  if (note) blocks.push(note);
  blocks.push(`${t.sent} ${host}/${owner.id} · ${day}`);
  const text = blocks.join('\n\n');

  const subject = `${t.subject}: ${name}${company ? ` (${company})` : ''}`;
  const digits = owner.phone.replace(/\D/g, '');
  return {
    subject,
    text,
    whatsappUrl: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
    mailtoUrl: `mailto:${owner.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text.replace(/\n/g, '\r\n'))}`,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type VisitorError = 'name' | 'contact';

export function validateVisitor(visitor: Visitor): VisitorError[] {
  const errors: VisitorError[] = [];
  if (!clean(visitor.name)) errors.push('name');
  const email = clean(visitor.email);
  const phoneDigits = (visitor.phone ?? '').replace(/\D/g, '');
  const hasEmail = EMAIL.test(email);
  const hasPhone = phoneDigits.length >= 6;
  if (!hasEmail && !hasPhone) errors.push('contact');
  return errors;
}
