// Renders share images, app icons and the Wallet logo, icon and poster
// artwork: `npm run media`. Outputs are committed.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { LOCALES, PEOPLE } from '../src/data/people.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = 4199;
const server = await createServer({ root, configFile: join(root, 'vite.config.ts'), server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();

const jobs = [
  ...PEOPLE.flatMap((p) =>
    LOCALES.map((l) => ({ path: `/__media/og/${p.id}/${l}`, out: `public/media/og-${p.id}-${l}.jpg`, w: 1200, h: 630, type: 'jpeg' })),
  ),
  ...LOCALES.map((l) => ({ path: `/__media/og-site/${l}`, out: `public/media/og-${l}.jpg`, w: 1200, h: 630, type: 'jpeg' })),
  { path: '/__media/icon/app-192', out: 'public/icons/icon-192.png', w: 192, h: 192 },
  { path: '/__media/icon/app-512', out: 'public/icons/icon-512.png', w: 512, h: 512 },
  { path: '/__media/icon/app-maskable-512', out: 'public/icons/icon-maskable-512.png', w: 512, h: 512 },
  { path: '/__media/icon/apple-180', out: 'public/icons/apple-touch-icon.png', w: 180, h: 180 },
  { path: '/__media/icon/favicon-32', out: 'public/icons/favicon-32.png', w: 32, h: 32, transparent: true },
  { path: '/__media/icon/wallet-logo', out: 'assets/wallet/logo.png', w: 160, h: 160, transparent: true },
  { path: '/__media/icon/wallet-wordmark', out: 'assets/wallet/wordmark.png', w: 1280, h: 400, transparent: true },
  { path: '/__media/icon/wallet-icon', out: 'assets/wallet/icon.png', w: 120, h: 120 },
  { path: '/__media/poster', out: 'assets/wallet/poster.png', w: 690, h: 1010 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.w, height: job.h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.error(job.path, e.message));
    await page.goto(`http://127.0.0.1:${port}${job.path}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__mediaReady === true, null, { timeout: 90_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const file = join(root, job.out);
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot(
      job.type === 'jpeg' ? { path: file, type: 'jpeg', quality: 88 } : { path: file, omitBackground: Boolean(job.transparent) },
    );
    await page.close();
    console.log(job.out);
  }
} finally {
  await browser.close();
  await server.close();
}
