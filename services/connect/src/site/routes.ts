import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COPY } from '../data/copy.ts';
import { DEFAULT_LOCALE, LOCALES, PEOPLE, links, type Locale } from '../data/people.ts';
import { fullVCard } from '../shared/vcard.ts';
import { cardPage, indexPage, notFoundPage, setupPage, type Assets, type WalletIndex } from './pages.ts';

export interface Output {
  /** Path inside the published site, starting with '/'. */
  path: string;
  type: string;
  body: string;
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

function readOptional(relative: string): Buffer | undefined {
  const file = ROOT + relative;
  return existsSync(file) ? readFileSync(file) : undefined;
}

export function loadWallet(): WalletIndex {
  const raw = readOptional('wallet/passes.json');
  return raw ? (JSON.parse(raw.toString('utf8')) as WalletIndex) : {};
}

const manifest = (id: string, l: Locale): string => {
  const p = PEOPLE.find((x) => x.id === id)!;
  return JSON.stringify(
    {
      name: `${p.name} · Caudals`,
      short_name: 'Caudals',
      description: COPY[l].metaDescription(p),
      lang: l,
      start_url: `${links.page(p, l)}?source=home`,
      scope: '/',
      display: 'standalone',
      background_color: '#0c0c0b',
      theme_color: '#0c0c0b',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    null,
    2,
  );
};

/** Every generated file of the site, except the bundled assets and public/. */
export function siteOutputs(assets: Assets): Output[] {
  const photo = readOptional('assets/contact-photo.png')?.toString('base64');
  const wallet = loadWallet();
  const revision = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const html = 'text/html; charset=utf-8';
  const outputs: Output[] = [];
  for (const l of LOCALES) {
    outputs.push({ path: `/${l}/index.html`, type: html, body: indexPage(l, assets) });
    outputs.push({ path: `/${l}/setup/index.html`, type: html, body: setupPage(l, assets, wallet) });
    for (const p of PEOPLE) {
      outputs.push({ path: `${links.page(p, l)}index.html`, type: html, body: cardPage(p, l, assets) });
      outputs.push({ path: links.vcard(p, l), type: 'text/vcard; charset=utf-8', body: fullVCard(p, l, { photo, revision }) });
      outputs.push({ path: `${links.page(p, l)}manifest.webmanifest`, type: 'application/manifest+json', body: manifest(p.id, l) });
    }
  }
  outputs.push({ path: '/404.html', type: html, body: notFoundPage(assets) });
  outputs.push({ path: '/robots.txt', type: 'text/plain; charset=utf-8', body: 'User-agent: *\nAllow: /\n' });
  return outputs;
}

/** Mirrors the Accept-Language map in infra/connect/nginx.conf. */
export function negotiate(acceptLanguage: string | undefined): Locale {
  const first = (acceptLanguage ?? '').trim().toLowerCase();
  if (!first) return DEFAULT_LOCALE;
  if (/^(es|ca|gl|eu)\b/.test(first)) return 'es';
  if (/^[a-z]/.test(first)) return 'en';
  return DEFAULT_LOCALE;
}

/** Language-negotiated short links, e.g. /mario → /es/mario/. Mirrors nginx. */
export function redirectFor(pathname: string, acceptLanguage: string | undefined): string | undefined {
  const lang = negotiate(acceptLanguage);
  if (pathname === '/') return `/${lang}/`;
  const ids = PEOPLE.map((p) => p.id).join('|');
  const short = new RegExp(`^/(${ids}|setup)/?$`).exec(pathname);
  if (short) return `/${lang}/${short[1]}/`;
  const bare = new RegExp(`^/(es|en)(?:/(${ids}|setup))?$`).exec(pathname);
  if (bare) return `${pathname}/`;
  return undefined;
}
