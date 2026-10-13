import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import './styles.css';
import { initCardPage } from './card-page.ts';
import { initSetupPage } from './setup-page.ts';

const root = document.documentElement;
root.classList.remove('no-js');
root.classList.add('js');

const page = document.body.classList;
if (page.contains('page-card')) initCardPage();
if (page.contains('page-setup')) initSetupPage();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
