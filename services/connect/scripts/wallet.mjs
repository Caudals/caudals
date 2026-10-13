// Issues and updates the founders' Apple/Google Wallet passes through the
// WalletWallet API: `npm run wallet [-- --dry-run] [--only=mario] [--locale=es] [--new]`.
//
// The key is read from WALLETWALLET_API_KEY or ~/.config/caudals/walletwallet.env
// and is never printed. Serials and install links are kept in wallet/passes.json
// (committed); the signed .pkpass files go to wallet/out/ (ignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { HOST, LOCALES, PEOPLE, links } from '../src/data/people.ts';

const API = 'https://api.walletwallet.dev';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const indexFile = join(root, 'wallet/passes.json');
const outDir = join(root, 'wallet/out');

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const dryRun = args.has('dry-run');
const forceNew = args.has('new');

function apiKey() {
  if (process.env.WALLETWALLET_API_KEY) return process.env.WALLETWALLET_API_KEY.trim();
  const file = join(homedir(), '.config/caudals/walletwallet.env');
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('WALLETWALLET_API_KEY='));
    if (line) return line.slice('WALLETWALLET_API_KEY='.length).trim();
  }
  throw new Error('Set WALLETWALLET_API_KEY or create ~/.config/caudals/walletwallet.env');
}

const png = (relative) => `data:image/png;base64,${readFileSync(join(root, relative)).toString('base64')}`;

const LABELS = {
  es: {
    phone: 'Teléfono',
    email: 'Email',
    card: 'Tarjeta',
    call: 'Reservar una llamada',
    about: 'Caudals',
    aboutText: 'Evaluamos asistentes de IA y creamos los datos que los mejoran. https://caudals.com',
  },
  en: {
    phone: 'Phone',
    email: 'Email',
    card: 'Card',
    call: 'Book a call',
    about: 'Caudals',
    aboutText: 'We evaluate AI assistants and build the data that makes them better. https://caudals.com',
  },
};

/** Short display name: primary values truncate after ~20 characters. */
const shortName = (p) => `${p.givenName} ${p.familyName.split(' ')[0]}`;

function passBody(p, l, images) {
  const t = LABELS[l];
  return {
    logoText: 'Caudals',
    organizationName: 'Caudals',
    description: `${p.name} · Caudals`,
    primaryFields: [{ label: p.role[l], value: shortName(p) }],
    secondaryFields: [
      { label: t.phone, value: p.phoneDisplay },
      { label: t.email, value: p.email },
    ],
    footerFields: [{ value: p.phoneDisplay }, { value: p.email }],
    backFields: [
      { label: t.card, value: links.card(p) },
      { label: t.phone, value: p.phone },
      { label: t.email, value: p.email },
      { label: 'WhatsApp', value: links.whatsapp(p) },
      { label: 'LinkedIn', value: p.linkedin },
      { label: t.call, value: links.call(l) },
      { label: t.about, value: t.aboutText },
    ],
    barcodeValue: links.card(p),
    barcodeFormat: 'QR',
    barcodeAltText: `${HOST}/${p.id}`,
    color: '#141413',
    sharingProhibited: false,
    ...images,
  };
}

async function call(method, path, key, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json.error ?? 'error'}${json.message ? ` (${json.message})` : ''}`);
  return json;
}

async function validate(buffer, p) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  for (const required of ['pass.json', 'manifest.json', 'signature']) {
    if (!names.includes(required)) throw new Error(`pkpass for ${p.id} is missing ${required}`);
  }
  const pass = JSON.parse(await zip.file('pass.json').async('string'));
  const message = pass.barcodes?.[0]?.message ?? pass.barcode?.message;
  if (message !== links.card(p)) throw new Error(`pkpass for ${p.id} encodes ${message}`);
  return { names, style: Object.keys(pass).filter((k) => ['generic', 'storeCard', 'posterGeneric'].includes(k)) };
}

const index = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
const images = {
  logoURL: png('assets/wallet/logo.png'),
  iconURL: png('assets/wallet/icon.png'),
  backgroundURL: png('assets/wallet/poster.png'),
};
const people = PEOPLE.filter((p) => !args.has('only') || p.id === args.get('only'));
const locales = LOCALES.filter((l) => !args.has('locale') || l === args.get('locale'));

if (dryRun) {
  for (const p of people) {
    for (const l of locales) {
      const body = passBody(p, l, Object.fromEntries(Object.keys(images).map((k) => [k, '<png>'])));
      const serial = index[p.id]?.[l]?.serial;
      console.log(`${serial && !forceNew ? `PUT /api/passes/${serial}` : 'POST /api/passes'} (${p.id}, ${l})`);
      console.log(JSON.stringify(body, null, 2));
    }
  }
  process.exit(0);
}

const key = apiKey();
mkdirSync(outDir, { recursive: true });
for (const p of people) {
  for (const l of locales) {
    const body = passBody(p, l, images);
    const existing = index[p.id]?.[l];
    if (existing?.serial && !forceNew) {
      const res = await call('PUT', `/api/passes/${existing.serial}`, key, body);
      console.log(`${p.id}/${l}: ${res.unchanged ? 'unchanged' : `updated, pushed to ${res.notifiedDevices} device(s)`}`);
      continue;
    }
    const res = await call('POST', '/api/passes', key, body);
    const buffer = Buffer.from(res.applePass, 'base64');
    const check = await validate(buffer, p);
    writeFileSync(join(outDir, `${p.id}-${l}.pkpass`), buffer);
    index[p.id] = {
      ...index[p.id],
      [l]: { serial: res.serialNumber, shareUrl: res.shareUrl, googleUrl: `${API}/api/passes/${res.serialNumber}/google` },
    };
    writeFileSync(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`${p.id}/${l}: created ${res.serialNumber} (${check.style.join(' + ')}, ${buffer.length} bytes)`);
  }
}

const usage = await call('GET', '/api/auth/usage', key);
console.log(`WalletWallet: ${usage.count}/${usage.limit} passes this month, plan ${usage.plan}${usage.trialExpiresAt ? `, trial until ${usage.trialExpiresAt.slice(0, 10)}` : ''}`);
