// Review screenshots: node scripts/screens.mjs <url> <outDir> [light|dark] [width] [height] [wait ms] [full]
import { chromium } from 'playwright';

const [url = 'http://127.0.0.1:4190/es/mario/', out = '.', scheme = 'dark', w = '390', h = '844', wait = '2200', full = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 3,
  colorScheme: scheme === 'light' ? 'light' : 'dark',
  isMobile: Number(w) < 700,
  hasTouch: Number(w) < 700,
});
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(wait));
const name = `${out}/${scheme}-${w}x${h}${full ? '-full' : ''}.png`;
await page.screenshot({ path: name, fullPage: Boolean(full) });
console.log(name);
console.log(logs.filter((l) => !l.includes('[vite]')).join('\n'));
await browser.close();
