import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import QRCode from 'qrcode';
import sharp from 'sharp';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowUpRight, ArrowLeft, ArrowRight, Mail, Phone, MessageCircle, Linkedin, QrCode, UserRoundPlus, Share2, Copy, Download, X, Smartphone, Github } from 'lucide-react';
import { people, copy, origin, vcard } from './src/content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(here, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'assets'), { recursive: true });
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const icon = component => renderToStaticMarkup(React.createElement(component, { className: 'icon', 'aria-hidden': true }));
const external = 'target="_blank" rel="noopener noreferrer"';
const brand = '<img src="/assets/mark.svg" width="29" height="29" alt="">Caudals';
const assets = ['style.css', 'client.js'];
for (const file of assets) await copyFile(path.join(here, 'src', file), path.join(out, 'assets', file));
for (const [from, to] of [['assets/fonts/Geist-Regular-latin.woff', 'geist.woff'], ['assets/fonts/Newsreader-Italic-latin.woff', 'newsreader.woff'], ['public/caudals_logo_black.svg', 'mark.svg'], ['assets/fonts/OFL-Geist.txt','OFL-Geist.txt'], ['assets/fonts/OFL-Newsreader.txt','OFL-Newsreader.txt']]) await copyFile(path.join(root, from), path.join(out, 'assets', to));
for (const size of [192, 512]) await sharp(path.join(root, 'public/caudals_profile_paper_pureblack_512.png')).resize(size, size).png().toFile(path.join(out, 'assets', `icon-${size}.png`));

function footer(t, locale, person) {
  return `<footer class="footer"><span>Caudals</span><div class="foot-links">${person ? `<button class="js-only" data-open="help-dialog">${icon(Smartphone)}${t.home}</button>` : ''}<a href="https://caudals.com/${locale}/legal/${locale === 'es' ? 'privacidad' : 'privacy'}" ${external}>${t.privacy}</a></div></footer>`;
}
function dialogs(t, person) {
  const name = `${person.first} ${person.last}`;
  const url = `${origin}/${person.id}`;
  const top = `<div class="dialog-top"><span class="dialog-brand">${brand}</span><button class="close" data-close aria-label="${t.close}" autofocus>${icon(X)}</button></div>`;
  return `<dialog id="qr-dialog" aria-labelledby="qr-person"><div class="dialog-inner">${top}
    <h2 class="qr-person" id="qr-person">${name}</h2><p class="qr-role">${t.role} · Caudals</p>
    <div class="segmented js-only" role="group" aria-label="QR"><button data-qr-mode="online" aria-pressed="true">${t.online}</button><button data-qr-mode="offline" aria-pressed="false">${t.offline}</button></div>
    <div class="qr-stage"><img id="qr-image" src="/assets/${person.id}-link.svg" width="330" height="330" alt="${t.online} · ${name}"></div>
    <input class="share-url" id="share-url" aria-label="URL" readonly value="${url}">
    <div class="share-actions"><button class="button primary" data-share>${icon(Share2)}${t.share}</button><button class="button secondary" id="copy-link">${icon(Copy)}${t.copy}</button></div>
    <a class="download-link" id="qr-download" href="/assets/${person.id}-link.png" download>${icon(Download)}${t.download}</a>
    <p class="status" id="share-status" role="status" aria-live="polite"></p>
  </div></dialog>
  <dialog id="help-dialog" aria-labelledby="help-title"><div class="dialog-inner">${top}<h2 class="help-title" id="help-title">${t.homeTitle}</h2><p class="help-intro">${t.homeIntro}</p>
    ${[['ios','iosHelp'],['android','androidHelp'],['poorSignal','signalHelp'],['nfc','nfcHelp']].map(([title, text]) => `<section class="help-section"><h3>${t[title]}</h3><p>${t[text]}</p>${title === 'nfc' ? `<input class="share-url" aria-label="NFC URL" readonly value="${url}">` : ''}</section>`).join('')}
  </div></dialog>`;
}
function page(locale, person) {
  const t = copy[locale];
  const name = person ? `${person.first} ${person.last}` : 'Caudals';
  const title = person ? `${name} · ${t.role} · Caudals` : `${t.teamHeading} · Caudals`;
  const url = `${origin}/${locale}/${person?.id || ''}`;
  const otherUrl = `/${t.other}/${person?.id || ''}`;
  const body = person ? `
    <main id="main"><article class="sheet profile-sheet" aria-label="${name}">
      <section class="identity"><div class="edition"><span></span><span>${person.number} / 02</span></div>
        <h1 class="name"><span class="first">${person.first}</span><span class="last">${person.last}</span></h1><p class="role">${t.role} <span>· Caudals</span></p>
        <div class="card-actions"><a class="button primary" href="/contacts/${person.id}.vcf" aria-describedby="save-hint">${icon(UserRoundPlus)}${t.save}</a><button class="button secondary js-only" data-open="qr-dialog">${icon(QrCode)}${t.qr}</button></div>
        <span id="save-hint" hidden>${t.contactHint}</span>
      </section>
      <section class="connections" aria-label="${t.choose}"><p class="eyebrow">${t.choose}</p>
        <!--email_off--><a class="contact-row" href="mailto:${person.email}"><span class="row-icon">${icon(Mail)}</span><span><small>${t.email}</small><strong>${person.email}</strong></span>${icon(ArrowUpRight).replace('class="icon"','class="icon arrow"')}</a><!--/email_off-->
        <a class="contact-row" href="tel:${person.phone}"><span class="row-icon">${icon(Phone)}</span><span><small>${t.phone}</small><strong>${person.displayPhone}</strong></span>${icon(ArrowUpRight).replace('class="icon"','class="icon arrow"')}</a>
        <a class="contact-row single" href="https://wa.me/${person.phone.slice(1)}" ${external}><span class="row-icon">${icon(MessageCircle)}</span><strong>${t.whatsapp}</strong>${icon(ArrowUpRight).replace('class="icon"','class="icon arrow"')}</a>
        <a class="contact-row single" href="${person.linkedin}" ${external}><span class="row-icon">${icon(Linkedin)}</span><strong>${t.linkedin}</strong>${icon(ArrowUpRight).replace('class="icon"','class="icon arrow"')}</a>
        <div class="minor-links"><a href="${person.github}" ${external}>${icon(Github)}${t.github}</a><button class="js-only" data-share>${icon(Share2)}${t.share}</button></div>
      </section>
    </article>
    <section class="company" aria-label="Caudals"><h2>${t.about}</h2><div><p>${t.pitch}</p><div class="company-links"><a class="text-link" href="https://caudals.com/${locale}" ${external}>${t.website}${icon(ArrowUpRight)}</a><a class="text-link" href="https://www.linkedin.com/company/caudals/" ${external}>${t.companyLinkedin}${icon(ArrowUpRight)}</a></div></div></section>
    </main>${footer(t, locale, person)}${dialogs(t, person)}` : `
    <main id="main" class="landing"><h1>${t.teamHeading}</h1>
      <div class="people">${people.map(p => `<a class="sheet person-link" href="/${locale}/${p.id}"><div class="edition"><span>${t.role}</span><span>${p.number} / 02</span></div><h2>${p.first} ${p.last.split(' ')[0]}</h2><!--email_off--><p>${p.email}</p><!--/email_off--><div class="link-bottom"><span>${t.card}</span>${icon(ArrowRight)}</div></a>`).join('')}</div>
    </main><div class="landing-footer">${footer(t, locale)}</div>`;
  const clientData = JSON.stringify({id: person?.id, name, url: person ? `${origin}/${person.id}` : origin, copy: t}).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${esc(title)}</title><meta name="description" content="${esc(t.intro)}"><meta name="robots" content="noindex, follow"><meta name="theme-color" content="#fafaf8"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${person?.first || 'Caudals'}"><link rel="canonical" href="${url}"><link rel="alternate" hreflang="es" href="${origin}/es/${person?.id || ''}"><link rel="alternate" hreflang="en" href="${origin}/en/${person?.id || ''}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(t.intro)}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}/assets/${person?.id || 'team'}-og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/assets/mark.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/assets/icon-192.png"><link rel="manifest" href="/${locale}/${person?.id || 'team'}.webmanifest"><link rel="preload" href="/assets/geist.woff" as="font" type="font/woff" crossorigin><link rel="stylesheet" href="/assets/style.css"></head><body><a class="skip" href="#main">${locale === 'es' ? 'Ir al contenido' : 'Skip to content'}</a><div class="shell"><header class="topbar"><a class="brand" href="/${locale}/" aria-label="Caudals · ${t.team}">${brand}</a><nav class="top-actions" aria-label="${t.team}">${person ? `<a class="back" href="/${locale}/">${icon(ArrowLeft)}<span>${t.team}</span></a>` : ''}<a class="locale" href="${otherUrl}" lang="${t.other}" hreflang="${t.other}">${t.lang}${icon(ArrowUpRight)}</a></nav></header>${body}<noscript><p class="nojs">${t.noJs}</p></noscript></div><script id="card-data" type="application/json">${clientData}</script><script src="/assets/client.js" defer></script></body></html>`;
}

const precache = ['/es/','/en/','/assets/style.css','/assets/client.js','/assets/geist.woff','/assets/mark.svg','/assets/icon-192.png','/assets/icon-512.png'];
await mkdir(path.join(out, 'contacts'), { recursive: true });
for (const person of people) {
  await writeFile(path.join(out, 'contacts', `${person.id}.vcf`), vcard(person));
  precache.push(`/contacts/${person.id}.vcf`);
  for (const kind of ['link','contact']) {
    const value = kind === 'link' ? `${origin}/${person.id}` : vcard(person, true);
    const svg = await QRCode.toString(value, { type:'svg', errorCorrectionLevel: 'M', margin:4, color: { dark:'#141413', light:'#ffffff' } });
    await writeFile(path.join(out, 'assets', `${person.id}-${kind}.svg`), svg);
    const qr = await QRCode.toBuffer(value, { width:960, margin:4, errorCorrectionLevel:'M', color: { dark:'#141413', light:'#ffffff' } });
    const label = Buffer.from(`<svg width="1200" height="1540"><rect width="1200" height="1540" fill="#fafaf8"/><text x="120" y="125" font-family="Helvetica" font-size="45" fill="#141413">Caudals</text><text x="120" y="255" font-family="Helvetica" font-size="80" fill="#141413">${person.first} ${person.last.split(' ')[0]}</text><text x="120" y="316" font-family="Helvetica" font-size="29" fill="#6b6a63">Co-founder · ${kind === 'link' ? 'Scan to connect' : 'Offline contact'}</text><text x="600" y="1414" text-anchor="middle" font-family="Helvetica" font-size="32" fill="#141413">connect.caudals.com/${person.id}</text></svg>`);
    await sharp(label).composite([{input: qr,top:370,left:120}]).png().toFile(path.join(out, 'assets', `${person.id}-${kind}.png`));
    precache.push(`/assets/${person.id}-${kind}.svg`, `/assets/${person.id}-${kind}.png`);
  }
}
for (const person of [...people, null]) {
  const title = person ? person.first : 'Equipo';
  const subtitle = person ? `${person.last} · Co-founder` : 'Mario Medrano · Alonso Sandoval';
  const og = Buffer.from(`<svg width="1200" height="630"><rect width="1200" height="630" fill="#fafaf8"/><rect x="45" y="45" width="1110" height="540" fill="white" stroke="#dcdad3"/><text x="104" y="130" font-size="35" font-family="Helvetica" fill="#141413">Caudals</text><text x="100" y="330" font-size="108" font-family="Helvetica" fill="#141413">${title}</text><text x="104" y="410" font-size="37" font-family="Helvetica" fill="#6b6a63">${subtitle}</text><text x="104" y="530" font-size="23" font-family="Helvetica" fill="#6b6a63">connect.caudals.com${person ? '/' + person.id : ''}</text></svg>`);
  await sharp(og).png().toFile(path.join(out, 'assets', `${person?.id || 'team'}-og.png`));
  for (const locale of ['es','en']) {
    const directory = path.join(out, locale, person?.id || '');
    await mkdir(directory, { recursive:true });
    await writeFile(path.join(directory, 'index.html'), page(locale, person));
    precache.push(`/${locale}/${person?.id || ''}`);
    await writeFile(path.join(out, locale, `${person?.id || 'team'}.webmanifest`), JSON.stringify({ id: `/${person?.id || ''}`, name: person ? `${person.first} · Caudals` : 'Caudals · Connect', short_name: person?.first || 'Caudals', start_url: `/${locale}/${person?.id || ''}`, scope: '/', display: 'standalone', background_color:'#fafaf8', theme_color:'#fafaf8', icons:[192,512].map(size => ({src:`/assets/icon-${size}.png`, sizes:`${size}x${size}`, type:'image/png', purpose:'any'})) }));
    precache.push(`/${locale}/${person?.id || 'team'}.webmanifest`);
  }
}
await writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
await writeFile(path.join(out, '404.html'), '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Not found · Caudals</title><link rel="stylesheet" href="/assets/style.css"><main class="shell landing"><h1>Nothing here. Let’s connect.</h1><a class="button primary" href="/">Caudals →</a></main></html>');
const revision = createHash('sha256');
for (const file of ['build.mjs','src/content.mjs','src/style.css','src/client.js']) revision.update(await readFile(path.join(here,file)));
const version = revision.digest('hex').slice(0,12);
const sw = `const CACHE='caudals-connect-${version}';
const FILES=${JSON.stringify([...new Set(precache)])};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('caudals-connect-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const aliases={'/':'/es/','/mario':'/es/mario','/alonso':'/es/alonso'};
 let key=aliases[url.pathname]||url.pathname;
 if(/^\\/(es|en)\\/(mario|alonso)\\/$/.test(key))key=key.slice(0,-1);
 if(!FILES.includes(key))return;
 const fresh=fetch(event.request).then(response=>{if(response.ok&&!response.redirected){const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(key,clone)).catch(()=>{})}return response});
 event.respondWith(Promise.race([fresh,new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),1800))]).catch(()=>caches.match(key).then(cached=>cached||fresh)));
});`;
await writeFile(path.join(out,'sw.js'),sw);
await writeFile(path.join(out,'release.json'), JSON.stringify({version, builtAt:new Date().toISOString()}));
console.log(`Built Connect ${version}: 6 pages, 2 vCards, 4 QR codes, offline cache.`);
