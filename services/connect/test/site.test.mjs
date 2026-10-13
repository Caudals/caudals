// Checks the built site in dist/ (run `npm run build` first) and the shared
// logic it is generated from.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { LOCALES, PEOPLE, links } from '../src/data/people.ts';
import { composeMessage, validateVisitor } from '../src/shared/message.ts';
import { compactVCard, fullVCard } from '../src/shared/vcard.ts';
import { qrMatrix } from '../src/site/qr.ts';
import { negotiate, redirectFor } from '../src/site/routes.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const read = (path) => readFileSync(join(dist, path), 'utf8');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });

function decode(rows) {
  const scale = 6;
  const quiet = 4;
  const size = (rows.length + quiet * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  rows.forEach((row, y) => {
    [...row].forEach((bit, x) => {
      if (bit !== '1') return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + quiet) * scale + dy) * size + (x + quiet) * scale + dx) * 4;
          pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
        }
      }
    });
  });
  return jsQR(pixels, size, size)?.data;
}

const cardData = (html) => JSON.parse(/<script type="application\/json" id="card-data">([^<]+)<\/script>/.exec(html)[1]);

test('every route is generated', () => {
  for (const file of ['404.html', 'robots.txt', 'sw.js', 'favicon.svg', 'icons/apple-touch-icon.png']) {
    assert.ok(existsSync(join(dist, file)), file);
  }
  for (const l of LOCALES) {
    assert.ok(existsSync(join(dist, l, 'index.html')));
    assert.ok(existsSync(join(dist, l, 'setup/index.html')));
    for (const p of PEOPLE) {
      assert.ok(existsSync(join(dist, links.page(p, l), 'index.html')), `${l}/${p.id}`);
      assert.ok(existsSync(join(dist, links.vcard(p, l))), links.vcard(p, l));
      assert.ok(existsSync(join(dist, l, p.id, 'manifest.webmanifest')));
      assert.ok(existsSync(join(dist, `media/og-${p.id}-${l}.jpg`)));
    }
  }
});

test('card pages carry the contact and the right links', () => {
  for (const l of LOCALES) {
    for (const p of PEOPLE) {
      const html = read(`${l}/${p.id}/index.html`);
      assert.match(html, new RegExp(`<html lang="${l}"`));
      assert.match(html, new RegExp(`<h1 class="name">${p.name}</h1>`));
      assert.ok(html.includes(`<dd><a href="${links.tel(p)}">${p.phoneDisplay}</a></dd>`), 'phone row calls');
      assert.ok(html.includes(`<dd><a href="${links.mailto(p)}">${p.email}</a></dd>`), 'email row emails');
      const tiles = [...html.matchAll(/<a class="quick-item" href="([^"]+)"/g)].map((m) => m[1]);
      assert.deepEqual(tiles, ['#qr', links.whatsapp(p), links.mailto(p), p.linkedin], 'QR first, no call tile');
      assert.match(html, /<a class="quick-item" href="#qr" data-open-qr/);
      assert.ok(html.includes(`href="${links.mailto(p)}"`));
      assert.ok(html.includes(`href="${links.whatsapp(p)}"`));
      assert.ok(html.includes(`href="${p.linkedin}"`));
      assert.ok(html.includes(`href="${links.vcard(p, l)}"`));
      assert.ok(html.includes(`href="${links.call(l)}"`));
      assert.ok(html.includes('<meta name="robots" content="noindex, nofollow">'));
      // Cloudflare's email obfuscation would rewrite the mailto links and break them offline.
      assert.ok(html.indexOf('<!--email_off-->') < html.indexOf(p.email) && html.lastIndexOf(p.email) < html.indexOf('<!--/email_off-->'));
      assert.ok(html.includes(`<link rel="canonical" href="https://connect.caudals.com/${l}/${p.id}/">`));
      const data = cardData(html);
      assert.equal(data.cardUrl, `https://connect.caudals.com/${p.id}`);
      assert.equal(decode(data.qr), data.cardUrl, 'link QR decodes to the permanent link');
    }
  }
});

test('pages need no inline script or style for the CSP', () => {
  for (const file of walk(dist).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(file, 'utf8');
    const scripts = [...html.matchAll(/<script(?![^>]*type="(?:module|application\/json)")[^>]*>/g)];
    assert.equal(scripts.length, 0, `${file} has a classic script`);
    for (const m of html.matchAll(/<script type="module"([^>]*)>/g)) assert.match(m[1], /src="\/assets\//, file);
    assert.doesNotMatch(html, /\son[a-z]+="/, `${file} has an inline handler`);
    assert.doesNotMatch(html, /\sstyle="/, `${file} has an inline style`);
  }
});

test('no italics and no greeting line anywhere', () => {
  for (const file of walk(dist).filter((f) => /\.(html|css)$/.test(f))) {
    const text = readFileSync(file, 'utf8');
    assert.doesNotMatch(text, /<(em|i)[\s>]/, `${file} has an italic element`);
    assert.doesNotMatch(text, /font-style:\s*italic|Newsreader/i, `${file} styles italics`);
    assert.doesNotMatch(text, /Great to meet you|Encantado de conocerte/, `${file} has the greeting`);
  }
});

test('assets referenced by the pages exist', () => {
  const html = read('es/mario/index.html');
  const refs = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 3);
  for (const ref of refs) assert.ok(existsSync(join(dist, ref)), ref);
});

test('the service worker precaches files that exist', () => {
  const sw = read('sw.js');
  assert.doesNotMatch(sw, /__(VERSION|PRECACHE|PEOPLE)__/);
  const list = JSON.parse(/const PRECACHE = (\[[^\]]+\]);/.exec(sw)[1]);
  assert.ok(list.length > 10);
  for (const url of list) {
    const file = url.endsWith('/') ? join(dist, url, 'index.html') : join(dist, url);
    assert.ok(existsSync(file), url);
  }
});

test('vCards follow RFC 2426 framing', () => {
  for (const l of LOCALES) {
    for (const p of PEOPLE) {
      const card = read(links.vcard(p, l));
      assert.ok(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
      assert.ok(card.endsWith('END:VCARD\r\n'));
      for (const line of card.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line.slice(0, 40));
      const unfolded = card.replace(/\r\n /g, '');
      assert.ok(unfolded.includes(`FN:${p.name}\r\n`));
      assert.ok(unfolded.includes(`TEL;TYPE=CELL,VOICE,pref:${p.phone}`));
      assert.ok(unfolded.includes(`EMAIL;TYPE=INTERNET,WORK,pref:${p.email}`));
      assert.ok(unfolded.includes(`TITLE:${p.role[l]}`));
      assert.ok(unfolded.includes('PHOTO;ENCODING=b;TYPE=PNG:'));
    }
  }
  assert.ok(fullVCard(PEOPLE[0], 'es').includes('ORG:Caudals'));
});

test('the offline QR carries a scannable contact', () => {
  for (const p of PEOPLE) {
    const text = compactVCard(p, 'es');
    assert.equal(decode(qrMatrix(text, 'L').rows), text);
    assert.ok(text.length < 300);
  }
});

test('visitor details compose WhatsApp and email messages', () => {
  const owner = { id: 'mario', givenName: 'Mario', email: 'mario@caudals.com', phone: '+34644321294' };
  const visitor = { name: 'Ana García', company: 'Acme', role: 'Head of AI', email: 'ana@acme.com', phone: '', web: '', message: 'Evaluar nuestro chatbot' };
  const es = composeMessage('es', owner, visitor, new Date('2026-10-13T10:00:00Z'));
  assert.ok(es.text.startsWith('Hola, Mario. Soy Ana García, Head of AI en Acme. Un placer conocerte.'));
  assert.ok(es.text.includes('Email: ana@acme.com'));
  assert.ok(!es.text.includes('Teléfono:'));
  assert.ok(es.text.includes('Evaluar nuestro chatbot'));
  assert.ok(es.text.endsWith('Enviado desde connect.caudals.com/mario · 13 oct 2026'));
  assert.ok(es.whatsappUrl.startsWith('https://wa.me/34644321294?text=Hola%2C%20Mario.'));
  assert.ok(es.mailtoUrl.startsWith('mailto:mario@caudals.com?subject=Nos%20conocimos%3A%20Ana%20Garc%C3%ADa%20(Acme)&body='));
  assert.ok(es.mailtoUrl.includes('%0D%0A'));
  const en = composeMessage('en', owner, { name: 'Sam', company: 'Beta' }, new Date('2026-10-13T10:00:00Z'));
  assert.ok(en.text.startsWith("Hi Mario, I'm Sam from Beta. Great to meet you."));
  assert.deepEqual(validateVisitor({ name: '' }), ['name', 'contact']);
  assert.deepEqual(validateVisitor({ name: 'Sam', email: 'sam@beta' }), ['contact']);
  assert.deepEqual(validateVisitor({ name: 'Sam', phone: '+34 600 000 000' }), []);
});

test('short links negotiate the language like nginx', () => {
  assert.equal(negotiate('es-ES,es;q=0.9'), 'es');
  assert.equal(negotiate('ca-ES,ca;q=0.9'), 'es');
  assert.equal(negotiate('en-US,en;q=0.9,es;q=0.8'), 'en');
  assert.equal(negotiate('de-DE'), 'en');
  assert.equal(negotiate(undefined), 'es');
  assert.equal(redirectFor('/mario', 'en-GB'), '/en/mario/');
  assert.equal(redirectFor('/alonso/', 'es'), '/es/alonso/');
  assert.equal(redirectFor('/', 'fr'), '/en/');
  assert.equal(redirectFor('/es/mario', 'en'), '/es/mario/');
  assert.equal(redirectFor('/es/mario/', 'en'), undefined);
  const nginx = readFileSync(join(root, '../../infra/connect/nginx.conf'), 'utf8');
  assert.ok(nginx.includes('(es|ca|gl|eu)'), 'nginx language map matches');
  assert.ok(nginx.includes(`(?<card>${PEOPLE.map((p) => p.id).join('|')}|setup)`), 'nginx short links list every card');
});

test('the setup page links every Wallet pass', () => {
  const index = JSON.parse(readFileSync(join(root, 'wallet/passes.json'), 'utf8'));
  for (const l of LOCALES) {
    const html = read(`${l}/setup/index.html`);
    for (const p of PEOPLE) {
      const pass = index[p.id]?.[l];
      assert.ok(pass?.serial, `${p.id}/${l} pass`);
      assert.ok(html.includes(`${pass.shareUrl}?lang=${l}`));
      assert.ok(html.includes(pass.googleUrl));
    }
  }
});

test('no WalletWallet key leaks into the repository or the build', () => {
  const pattern = /ww_live_[0-9a-f]{32}/;
  const files = [...walk(dist), ...walk(join(root, 'src')), ...walk(join(root, 'scripts')), ...walk(join(root, 'wallet')).filter((f) => !f.endsWith('.pkpass'))];
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'latin1'), pattern, file);
});
