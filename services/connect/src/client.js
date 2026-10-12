document.documentElement.classList.add('enhanced');
const data = JSON.parse(document.getElementById('card-data').textContent);
const qrDialog = document.getElementById('qr-dialog');
const helpDialog = document.getElementById('help-dialog');
let wakeLock;
let opener;

async function keepAwake() {
  if (!qrDialog?.open || document.visibilityState !== 'visible') return;
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* Optional enhancement. */ }
}
function openDialog(dialog, trigger) {
  opener = trigger;
  dialog.showModal();
  if (dialog === qrDialog) keepAwake();
}
for (const trigger of document.querySelectorAll('[data-open]')) {
  trigger.addEventListener('click', () => openDialog(document.getElementById(trigger.dataset.open), trigger));
}
for (const dialog of [qrDialog, helpDialog].filter(Boolean)) {
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialog === qrDialog) { wakeLock?.release().catch(() => {}); wakeLock = undefined; }
    opener?.focus();
  });
}
document.addEventListener('visibilitychange', keepAwake);

if (qrDialog) {
  const status = document.getElementById('share-status');
  const urlField = document.getElementById('share-url');
  const fullUrl = data.url;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      status.textContent = data.copy.copied;
    } catch {
      status.textContent = data.copy.copyFailed;
      urlField.focus(); urlField.select(); urlField.setSelectionRange(0, urlField.value.length);
    }
  }
  document.getElementById('copy-link').addEventListener('click', copyLink);
  for (const button of document.querySelectorAll('[data-share]')) {
    button.addEventListener('click', async () => {
      const shareData = { title: `${data.name} · Caudals`, url: fullUrl };
      if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
        try { await navigator.share(shareData); return; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
      if (!qrDialog.open) openDialog(qrDialog, button);
      await copyLink();
    });
  }
  for (const button of document.querySelectorAll('[data-qr-mode]')) {
    button.addEventListener('click', () => {
      const offline = button.dataset.qrMode === 'offline';
      for (const tab of document.querySelectorAll('[data-qr-mode]')) tab.setAttribute('aria-pressed', String(tab === button));
      document.getElementById('qr-image').src = `/assets/${data.id}-${offline ? 'contact' : 'link'}.svg`;
      document.getElementById('qr-image').alt = `${offline ? data.copy.offline : data.copy.online} · ${data.name}`;
      const hint = document.getElementById('qr-hint');
      if (hint) hint.textContent = offline ? data.copy.offlineSub : data.copy.scanSub;
      document.getElementById('qr-download').href = `/assets/${data.id}-${offline ? 'contact' : 'link'}.png`;
      status.textContent = '';
    });
  }
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
