import { $$, copyText, readJson, toast } from './ui.ts';

interface SetupData {
  copied: string;
  nfcWriting: string;
  nfcDone: string;
  nfcFailed: string;
}

interface NdefWriter {
  write(message: { records: { recordType: string; data: string }[] }): Promise<void>;
}

export function initSetupPage() {
  const t = readJson<SetupData>('setup-data');
  if (!t) return;

  $$<HTMLButtonElement>('[data-copy]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      if (await copyText(button.dataset.copy ?? '')) toast(t.copied);
    });
  });

  const Reader = (window as unknown as { NDEFReader?: new () => NdefWriter }).NDEFReader;
  if (!Reader) return;
  $$<HTMLButtonElement>('[data-nfc]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      toast(t.nfcWriting);
      try {
        await new Reader().write({ records: [{ recordType: 'url', data: button.dataset.nfc ?? '' }] });
        toast(t.nfcDone);
      } catch {
        toast(t.nfcFailed);
      }
    });
  });
}
