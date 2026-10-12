import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { chromium, webkit } from '@playwright/test';
import { people, origin, vcard } from './src/content.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = process.env.CONNECT_BASE_URL || 'http://127.0.0.1:4179';
test('QR assets decode independently to the intended person and contact', async () => {
  for (const person of people) {
    for (const kind of ['link', 'contact']) {
      for (const ext of ['svg', 'png']) {
        let image = sharp(path.join(here, 'dist/assets', `${person.id}-${kind}.${ext}`));
        if (ext === 'svg') image = image.resize(800,800);
        const {data,info} = await image.ensureAlpha().raw().toBuffer({resolveWithObject:true});
        const decoded = jsQR(new Uint8ClampedArray(data),info.width,info.height);
        assert.ok(decoded, `${person.id} ${kind}.${ext} must decode`);
        assert.equal(decoded.data, kind === 'link' ? `${origin}/${person.id}` : vcard(person,true));
      }
    }
  }
});
test('contact downloads preserve phones, emails, names, social URLs and CRLF', async () => {
  for (const person of people) {
    const card=await readFile(path.join(here,'dist/contacts',`${person.id}.vcf`),'utf8');
    assert.ok(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
    assert.ok(card.includes(`TEL;TYPE=CELL:${person.phone}\r\n`));
    assert.ok(card.includes(person.email));assert.ok(card.includes(person.linkedin));
    assert.ok(card.endsWith('END:VCARD\r\n'));
    assert.ok(card.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
  }
});
for (const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]) {
  test(`${engine}: both languages, phone layouts, QR, download and dialogs`, async () => {
    const browser=await browserType.launch({headless:true});
    try {
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',acceptDownloads:true});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      for(const person of people) for(const locale of ['es','en']) {
        await page.goto(`${base}/${locale}/${person.id}`);
        assert.equal(await page.locator('html').getAttribute('lang'),locale);
        assert.match(await page.locator('h1').innerText(),new RegExp(person.first));
        assert.equal(await page.locator('a[href^="tel:"]').getAttribute('href'),`tel:${person.phone}`);
        assert.equal(await page.locator('a[href^="mailto:"]').getAttribute('href'),`mailto:${person.email}`);
        assert.equal(await page.locator('a[href^="https://wa.me"]').getAttribute('href'),`https://wa.me/${person.phone.slice(1)}`);
        for (const width of [320,390,768,1440]) {
          await page.setViewportSize({width,height:844});
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${person.id} ${locale} width ${width}`);
        }
        await page.setViewportSize({width:390,height:844});
        await page.locator('[data-open="qr-dialog"]').click();
        assert.equal(await page.locator('#qr-dialog').evaluate(d=>d.open),true);
        await page.locator('[data-qr-mode="offline"]').click();
        assert.equal(await page.locator('#qr-image').getAttribute('src'),`/assets/${person.id}-contact.svg`);
        assert.equal(await page.locator('#qr-download').getAttribute('href'),`/assets/${person.id}-contact.png`);
        const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#qr-download').click()]);
        assert.equal(download.suggestedFilename(),`${person.id}-contact.png`);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-open="qr-dialog"]').evaluate(el=>el===document.activeElement),true);
        await page.locator('[data-open="help-dialog"]').click();
        assert.equal(await page.locator('#help-dialog').evaluate(d=>d.open),true);
        await page.locator('#help-dialog [data-close]').click();
      }
      await page.goto(`${base}/es/mario`);
      await page.evaluate(async()=>{await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}))});
      assert.equal(await page.evaluate(async()=>!!await caches.match('/es/mario')),true);
      // Playwright WebKit's emulated offline switch blocks requests before its
      // service worker (including cached navigations). Verify real offline
      // navigation in Chromium; physical iOS offline acceptance remains manual.
      if (engine === 'chromium') {
        await context.setOffline(true);
        await page.reload();
        assert.match(await page.locator('h1').innerText(),/Mario/);
        await page.locator('[data-open="qr-dialog"]').click();
        await page.locator('[data-qr-mode="offline"]').click();
        await page.locator('#qr-image').evaluate(img=>img.decode());
        await page.keyboard.press('Escape');
        await page.goto(`${base}/en/alonso`);
        assert.match(await page.locator('h1').innerText(),/Alonso/);
      }
      assert.deepEqual(errors,[]);
      await context.close();
    } finally {await browser.close()}
  });
}
test('no JavaScript still provides all core contact links',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
    await page.goto(`${base}/es/mario`);
    assert.equal(await page.locator('a[href="/contacts/mario.vcf"]').isVisible(),true);
    assert.equal(await page.locator('a[href="mailto:mario@caudals.com"]').isVisible(),true);
    assert.equal(await page.locator('[data-open="qr-dialog"]').isVisible(),false);
  }finally{await browser.close()}
});
test('native sharing, cancellation, copy fallback and rendered offline QR',async()=>{
  const browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'});
    const page=await context.newPage();await page.goto(`${base}/es/mario`);
    await page.evaluate(()=>{navigator.share=async data=>{window.shared=data};navigator.canShare=()=>true});
    await page.locator('.minor-links [data-share]').click();
    assert.equal(await page.evaluate(()=>window.shared.url),`${origin}/mario`);
    await page.evaluate(()=>{navigator.share=async()=>{throw new DOMException('Cancelled','AbortError')}});
    await page.locator('.minor-links [data-share]').click();
    assert.equal(await page.locator('#qr-dialog').evaluate(d=>d.open),false);
    await page.evaluate(()=>{navigator.share=undefined;Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied')}}})});
    await page.locator('.minor-links [data-share]').click();
    assert.equal(await page.locator('#qr-dialog').evaluate(d=>d.open),true);
    assert.match(await page.locator('#share-status').innerText(),/Selecciona/);
    assert.equal(await page.locator('#share-url').inputValue(),`${origin}/mario`);
    await page.locator('[data-qr-mode="offline"]').click();
    await page.locator('#qr-image').evaluate(img=>img.decode());
    const png=await page.locator('#qr-image').screenshot();
    const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data,vcard(people[0],true));
  }finally{await browser.close()}
});
test('landing page has title "Equipo" / "Team", no eyebrow, no subtitle, and no italics in cards', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/es/`);
    assert.equal(await page.locator('h1').innerText(), 'Equipo');
    assert.equal(await page.locator('.landing .eyebrow').count(), 0);
    assert.equal(await page.locator('.landing .intro').count(), 0);
    assert.equal(await page.locator('.people em').count(), 0);
    assert.equal(await page.locator('.footer span').first().innerText(), 'Caudals');
    await page.goto(`${base}/en/`);
    assert.equal(await page.locator('h1').innerText(), 'Team');
    assert.equal(await page.locator('.landing .eyebrow').count(), 0);
    assert.equal(await page.locator('.landing .intro').count(), 0);
    assert.equal(await page.locator('.people em').count(), 0);
    await page.goto(`${base}/es/mario`);
    assert.equal(await page.locator('.identity .name em').count(), 0);
    assert.equal(await page.locator('.identity .signature-rule').count(), 0);
    assert.equal(await page.locator('.identity .identity-note').count(), 0);
    assert.equal(await page.locator('.company h2').innerText(), 'Enseñamos a tu IA a pensar como un experto');
    await page.locator('[data-open="qr-dialog"]').click();
    assert.equal(await page.locator('#qr-dialog .qr-caption').count(), 0);
    assert.equal(await page.locator('#qr-dialog #qr-hint').count(), 0);
  } finally {
    await browser.close();
  }
});

