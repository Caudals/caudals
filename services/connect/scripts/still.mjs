// Review a /__media page: node scripts/still.mjs <path> <out.png> [width] [height] [scale]
import { chromium } from 'playwright';

const [path, out, w = '1200', h = '630', scale = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: Number(scale) });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(`http://127.0.0.1:4190${path}`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__mediaReady === true, null, { timeout: 60000 });
await page.waitForTimeout(300);
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
console.log(out);
