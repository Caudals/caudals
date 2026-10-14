import { COPY, type Copy } from '../data/copy.ts';
import { HOST, LOCALES, ORIGIN, PEOPLE, links, type Locale, type Person } from '../data/people.ts';
import { compactVCard } from '../shared/vcard.ts';
import { markSvg } from '../shared/mark.ts';
import { esc, jsonScript } from './html.ts';
import { icons } from './icons.ts';
import { qrMatrix, qrSvg } from './qr.ts';

export interface Assets {
  css: string[];
  js: string;
  /** Font files worth preloading. */
  fonts: string[];
  modulepreload: string[];
}

export interface WalletEntry {
  serial: string;
  shareUrl: string;
  googleUrl: string;
}
export type WalletIndex = Partial<Record<string, Partial<Record<Locale, WalletEntry>>>>;

const YEAR = new Date().getFullYear();
const other = (l: Locale): Locale => (l === 'es' ? 'en' : 'es');

interface HeadOptions {
  locale: Locale;
  title: string;
  description: string;
  path: string;
  alternates?: Partial<Record<Locale, string>>;
  image?: string;
  manifest?: string;
  type?: string;
}

function head(o: HeadOptions, assets: Assets): string {
  const c = COPY[o.locale];
  const url = ORIGIN + o.path;
  const alt = o.alternates
    ? Object.entries(o.alternates)
        .map(([l, p]) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${p}">`)
        .join('')
    : '';
  const image = o.image ? ORIGIN + o.image : `${ORIGIN}/media/og-${o.locale}.jpg`;
  return `<!doctype html>
<html lang="${o.locale}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${url}">${alt}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fafaf8">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0c0c0b">
<meta name="format-detection" content="telephone=no">
<meta property="og:type" content="${o.type ?? 'website'}">
<meta property="og:site_name" content="Caudals">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="${c.ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
${o.manifest ? `<link rel="manifest" href="${o.manifest}">` : ''}
<meta name="apple-mobile-web-app-title" content="Caudals">
${assets.fonts.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`).join('\n')}
${assets.css.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
<script type="module" src="${assets.js}"></script>
${assets.modulepreload.map((href) => `<link rel="modulepreload" href="${href}">`).join('\n')}
</head>`;
}

/** Gradient for the flat card's foil mark; the 3D card replaces it with real foil. */
const FOIL_DEFS =
  '<svg class="defs" aria-hidden="true" width="0" height="0"><defs><linearGradient id="cf-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c9c8c1"/><stop offset="0.35" stop-color="#a9bcb6"/><stop offset="0.62" stop-color="#b9abc3"/><stop offset="1" stop-color="#9d9b93"/></linearGradient></defs></svg>';

const brand = (l: Locale): string =>
  `<a class="brand" href="${links.site(l)}">${markSvg('brand-mark')}<span>Caudals</span></a>`;

const footer = (l: Locale): string => {
  const c = COPY[l];
  return `<footer class="footer"><span>${esc(c.footer.rights(YEAR))}</span><a href="${links.privacy(l)}">${esc(c.footer.privacy)}</a></footer>`;
};

/** The flat card: first paint, no-WebGL fallback and the 3D card's resting outline. */
const flatCard = (p: Person, l: Locale, extra = ''): string => `<div class="card-flat${extra}" aria-hidden="true">
<span class="cf-brand">${markSvg('cf-brand-mark')}<span>Caudals</span></span>
${markSvg('cf-mark')}
<span class="cf-name"><span>${esc(p.cardLines[0])}</span><span>${esc(p.cardLines[1])}</span></span>
<span class="cf-role">${esc(COPY[l].roleLine(p))}</span>
</div>`;

export function cardPage(p: Person, l: Locale, assets: Assets): string {
  const c = COPY[l];
  const o = other(l);
  const link = qrMatrix(links.card(p), 'M');
  const offline = qrMatrix(compactVCard(p, l), 'L');
  const mailFallback = `mailto:${p.email}?subject=${encodeURIComponent(c.exchange.title)}`;
  const data = {
    id: p.id,
    locale: l,
    name: p.name,
    givenName: p.givenName,
    cardLines: p.cardLines,
    roleLine: c.roleLine(p),
    phone: p.phone,
    phoneDisplay: p.phoneDisplay,
    email: p.email,
    host: HOST,
    cardUrl: links.card(p),
    qr: link.rows,
    t: {
      copied: c.copied,
      shareFailed: c.shareFailed,
      shareText: c.shareText(p),
      errName: c.form.errName,
      errContact: c.form.errContact,
      forgotten: c.form.forgotten,
    },
  };
  // Calling and emailing also work from the phone and email rows below.
  const external = ' target="_blank" rel="noopener"';
  const quick = [
    { href: '#qr', icon: icons.qr, label: c.qr.tile, attrs: ` data-open-qr aria-label="${esc(c.showQr)}"` },
    { href: links.whatsapp(p), icon: icons.whatsapp, label: c.whatsapp, attrs: external },
    { href: links.mailto(p), icon: icons.mail, label: c.email, attrs: '' },
    { href: p.linkedin, icon: icons.linkedin, label: c.linkedin, attrs: external },
  ];
  return `${head(
    {
      locale: l,
      title: c.metaTitle(p),
      description: c.metaDescription(p),
      path: links.page(p, l),
      alternates: { es: links.page(p, 'es'), en: links.page(p, 'en') },
      image: `/media/og-${p.id}-${l}.jpg`,
      manifest: `/${l}/${p.id}/manifest.webmanifest`,
      type: 'profile',
    },
    assets,
  )}
<body class="page page-card" data-person="${p.id}">
<!--email_off-->
${FOIL_DEFS}
<a class="skip" href="#main">${esc(c.skip)}</a>
<header class="topbar">
${brand(l)}
<div class="topbar-actions">
<a class="chip" href="${links.page(p, o)}" lang="${o}" hreflang="${o}" aria-label="${esc(c.switchTo)}">${COPY[l].switchShort}</a>
<button class="icon-btn" type="button" data-share aria-label="${esc(c.share)}" hidden>${icons.share}</button>
<button class="icon-btn" type="button" data-open-qr aria-label="${esc(c.showQr)}" hidden>${icons.qr}</button>
</div>
</header>
<main id="main">
<section class="hero" aria-label="${esc(c.cardLabel(p))}">
<div class="stage" data-stage>
<canvas class="stage-canvas" aria-hidden="true"></canvas>
${flatCard(p, l)}
</div>
<div class="stage-foot">
<p class="stage-hint" data-hint>${icons.flip}<span>${esc(c.hint)}</span></p>
<button class="chip motion-btn" type="button" data-motion hidden>${icons.motion}<span>${esc(c.motion)}</span></button>
</div>
</section>
<section class="intro rise">
<h1 class="name">${esc(p.name)}</h1>
<p class="role">${esc(c.roleLine(p))}</p>
</section>
<section class="actions rise" aria-label="${esc(c.save)}">
<a class="btn btn-primary btn-save" href="${links.vcard(p, l)}" type="text/vcard">${icons.contact}<span>${esc(c.save)}</span></a>
<ul class="quick">
${quick
  .map(
    (q) =>
      `<li><a class="quick-item" href="${esc(q.href)}"${q.attrs}>${q.icon}<span>${esc(q.label)}</span></a></li>`,
  )
  .join('\n')}
</ul>
<dl class="ledger">
<div><dt>${esc(c.form.phone)}</dt><dd><a href="${links.tel(p)}">${esc(p.phoneDisplay)}</a></dd></div>
<div><dt>${esc(c.form.email)}</dt><dd><a href="${links.mailto(p)}">${esc(p.email)}</a></dd></div>
</dl>
</section>
<section class="exchange rise">
<h2 class="section-title">${esc(c.exchange.title)}</h2>
<p class="section-body">${esc(c.exchange.body)}</p>
<a class="btn btn-ghost" href="${esc(mailFallback)}" data-open-exchange>${icons.send}<span>${esc(c.exchange.cta)}</span></a>
</section>
<section class="about rise">
<p class="label">${esc(c.about.label)}</p>
<p class="statement">${esc(c.about.statement)}</p>
<p class="section-body">${esc(c.about.body)}</p>
<ul class="links">
<li><a href="${links.site(l)}" target="_blank" rel="noopener">${esc(c.about.site)}${icons.arrow}</a></li>
<li><a href="${links.call(l)}" target="_blank" rel="noopener">${esc(c.about.call)}${icons.arrow}</a></li>
<li><a href="${links.companyLinkedin}" target="_blank" rel="noopener">${esc(c.about.linkedin)}${icons.arrow}</a></li>
</ul>
</section>
</main>
${footer(l)}
<dialog class="qr-sheet" data-qr-sheet aria-labelledby="qr-title">
<div class="qr-inner">
<div class="qr-top">
<p class="qr-who">${esc(p.name)}</p>
<button class="icon-btn" type="button" data-close aria-label="${esc(c.qr.close)}">${icons.close}</button>
</div>
<h2 class="qr-title" id="qr-title">${esc(c.qr.title)}</h2>
<div class="qr-frame">
<div class="qr-view" data-qr-view="link">${qrSvg(link, c.qr.label)}</div>
<div class="qr-view" data-qr-view="offline" hidden>${qrSvg(offline, c.qr.label)}</div>
</div>
<p class="qr-hint" data-qr-hint="link">${esc(c.qr.linkHint)}</p>
<p class="qr-hint" data-qr-hint="offline" hidden>${esc(c.qr.offlineHint)}</p>
<div class="segmented" role="tablist" aria-label="${esc(c.qr.label)}">
<button type="button" role="tab" aria-selected="true" data-qr-tab="link">${esc(c.qr.link)}</button>
<button type="button" role="tab" aria-selected="false" data-qr-tab="offline">${esc(c.qr.offline)}</button>
</div>
<p class="qr-foot"><span class="qr-url">${HOST}/${p.id}</span><span class="qr-bright">${esc(c.qr.brightness)}</span></p>
</div>
</dialog>
<dialog class="sheet" data-exchange-sheet aria-labelledby="exchange-title">
<form class="sheet-inner exchange-form" novalidate>
<div class="sheet-grip" aria-hidden="true"></div>
<div class="sheet-head">
<h2 class="sheet-title" id="exchange-title">${esc(c.form.title(p))}</h2>
<button class="icon-btn" type="button" data-close aria-label="${esc(c.form.close)}">${icons.close}</button>
</div>
<p class="sheet-intro">${esc(c.form.intro)}</p>
<div class="fields">
<label class="field"><span>${esc(c.form.name)}</span><input name="name" autocomplete="name" required maxlength="120" enterkeyhint="next"></label>
<div class="field-pair">
<label class="field"><span>${esc(c.form.company)}</span><input name="company" autocomplete="organization" maxlength="120" enterkeyhint="next"></label>
<label class="field"><span>${esc(c.form.role)}</span><input name="role" autocomplete="organization-title" maxlength="120" enterkeyhint="next"></label>
</div>
<label class="field"><span>${esc(c.form.email)}</span><input name="email" type="email" autocomplete="email" inputmode="email" maxlength="200" enterkeyhint="next"></label>
<label class="field"><span>${esc(c.form.phone)}</span><input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" enterkeyhint="next"></label>
<label class="field"><span>${esc(c.form.web)}</span><input name="web" autocomplete="url" inputmode="url" autocapitalize="off" spellcheck="false" maxlength="300" enterkeyhint="next"></label>
<label class="field"><span>${esc(c.form.message)}</span><textarea name="message" rows="2" maxlength="1200" placeholder="${esc(c.form.messagePlaceholder)}"></textarea></label>
</div>
<p class="form-error" role="alert" data-form-error hidden></p>
<div class="sheet-actions">
<button class="btn btn-primary" type="submit" value="whatsapp">${icons.whatsapp}<span>${esc(c.form.viaWhatsapp)}</span></button>
<button class="btn btn-secondary" type="submit" value="email">${icons.mail}<span>${esc(c.form.viaEmail)}</span></button>
</div>
<p class="sheet-note">${esc(c.form.note)} <button class="link-btn" type="button" data-forget>${esc(c.form.forget)}</button></p>
</form>
</dialog>
<div class="toast" role="status" aria-live="polite" data-toast></div>
${jsonScript('card-data', data)}
<!--/email_off-->
</body>
</html>
`;
}

export function indexPage(l: Locale, assets: Assets): string {
  const c = COPY[l];
  const o = other(l);
  return `${head(
    {
      locale: l,
      title: c.index.metaTitle,
      description: c.index.metaDescription,
      path: `/${l}/`,
      alternates: { es: '/es/', en: '/en/' },
    },
    assets,
  )}
<body class="page page-index">
${FOIL_DEFS}
<a class="skip" href="#main">${esc(c.skip)}</a>
<header class="topbar">
${brand(l)}
<div class="topbar-actions"><a class="chip" href="/${o}/" lang="${o}" hreflang="${o}" aria-label="${esc(c.switchTo)}">${c.switchShort}</a></div>
</header>
<main id="main" class="index-main">
<section class="index-intro rise">
<h1 class="index-title">${esc(c.index.title)}</h1>
<p class="section-body">${esc(c.index.body)}</p>
</section>
<ul class="people rise">
${PEOPLE.map(
  (p) => `<li><a class="person" href="${links.page(p, l)}">
${flatCard(p, l, ' card-mini')}
<span class="person-text"><span class="person-name">${esc(p.name)}</span><span class="person-role">${esc(c.roleLine(p))}</span></span>
<span class="person-open">${esc(c.index.open)}${icons.arrow}</span>
</a></li>`,
).join('\n')}
</ul>
</main>
${footer(l)}
</body>
</html>
`;
}

export function setupPage(l: Locale, assets: Assets, wallet: WalletIndex): string {
  const c = COPY[l];
  const s = c.setup;
  const o = other(l);
  const people = PEOPLE.map((p) => {
    const pass = wallet[p.id]?.[l];
    const quickUrl = `${links.card(p)}#qr`;
    return `<section class="setup-person rise" aria-labelledby="setup-${p.id}">
<div class="setup-person-head">
${flatCard(p, l, ' card-mini')}
<div><h2 class="setup-name" id="setup-${p.id}">${esc(p.name)}</h2>
<a class="text-link" href="${links.page(p, l)}">${esc(s.open)}${icons.arrow}</a></div>
</div>
<div class="setup-block">
<h3>${icons.wallet}<span>${esc(s.wallet)}</span></h3>
<p>${esc(s.walletBody)}</p>
${
  pass
    ? `<div class="setup-buttons"><a class="btn btn-primary" href="${esc(pass.shareUrl)}?lang=${l}">${icons.wallet}<span>${esc(s.addApple)}</span></a><a class="btn btn-ghost" href="${esc(pass.googleUrl)}">${esc(s.addGoogle)}</a></div>`
    : `<p class="muted">${esc(s.walletMissing)}</p>`
}
<p class="muted">${esc(s.walletUse)}</p>
</div>
<div class="setup-block">
<h3>${icons.qr}<span>${esc(s.quick)}</span></h3>
<p>${esc(s.quickBody)}</p>
<p class="setup-url"><code>${esc(quickUrl)}</code><button class="chip" type="button" data-copy="${esc(quickUrl)}" hidden>${icons.copy}<span>${esc(s.copyLink)}</span></button></p>
</div>
<div class="setup-block">
<h3>${icons.nfc}<span>${esc(s.nfc)}</span></h3>
<p>${esc(s.nfcBody)}</p>
<p class="setup-url"><code>${esc(links.card(p))}</code><button class="chip" type="button" data-copy="${esc(links.card(p))}" hidden>${icons.copy}<span>${esc(s.copyLink)}</span></button></p>
<button class="btn btn-ghost" type="button" data-nfc="${esc(links.card(p))}" hidden>${icons.nfc}<span>${esc(s.nfcWrite)}</span></button>
</div>
</section>`;
  }).join('\n');
  return `${head(
    {
      locale: l,
      title: s.metaTitle,
      description: s.intro,
      path: `/${l}/setup/`,
      alternates: { es: '/es/setup/', en: '/en/setup/' },
    },
    assets,
  )}
<body class="page page-setup">
${FOIL_DEFS}
<a class="skip" href="#main">${esc(c.skip)}</a>
<header class="topbar">
${brand(l)}
<div class="topbar-actions"><a class="chip" href="/${o}/setup/" lang="${o}" hreflang="${o}" aria-label="${esc(c.switchTo)}">${c.switchShort}</a></div>
</header>
<main id="main" class="setup-main">
<section class="index-intro rise">
<h1 class="index-title">${esc(s.title)}</h1>
<p class="section-body">${esc(s.intro)}</p>
</section>
${people}
<section class="setup-general rise">
<div class="setup-block"><h3>${icons.home}<span>${esc(s.home)}</span></h3><p>${esc(s.homeBody)}</p></div>
<div class="setup-block"><h3>${icons.signal}<span>${esc(s.offline)}</span></h3><p>${esc(s.offlineBody)}</p></div>
</section>
</main>
${footer(l)}
<div class="toast" role="status" aria-live="polite" data-toast></div>
${jsonScript('setup-data', { copied: c.copied, nfcWriting: s.nfcWriting, nfcDone: s.nfcDone, nfcFailed: s.nfcFailed })}
</body>
</html>
`;
}

export function notFoundPage(assets: Assets): string {
  const [es, en]: Copy[] = [COPY.es, COPY.en];
  return `${head({ locale: 'es', title: `${es.notFound.title} · Caudals`, description: es.notFound.body, path: '/404.html' }, assets)}
<body class="page page-missing">
<header class="topbar">${brand('es')}</header>
<main id="main" class="missing-main">
${LOCALES.map((l) => {
  const c = l === 'es' ? es : en;
  return `<section class="missing rise" lang="${l}"><h1 class="index-title">${esc(c.notFound.title)}</h1><p class="section-body">${esc(c.notFound.body)}</p><a class="text-link" href="/${l}/">${esc(c.notFound.back)}${icons.arrow}</a></section>`;
}).join('\n')}
</main>
${footer('es')}
</body>
</html>
`;
}
