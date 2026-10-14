import { composeMessage, validateVisitor, type MessageLocale, type Visitor } from '../shared/message.ts';
import type { StageScene } from './scene/stage.ts';
import { $, $$, copyText, readJson, reduceMotion, sheet, store, toast } from './ui.ts';

interface CardData {
  id: string;
  locale: MessageLocale;
  name: string;
  givenName: string;
  cardLines: [string, string];
  roleLine: string;
  phone: string;
  phoneDisplay: string;
  email: string;
  host: string;
  cardUrl: string;
  qr: string[];
  t: {
    copied: string;
    shareFailed: string;
    shareText: string;
    errName: string;
    errContact: string;
    forgotten: string;
  };
}

const VISITOR_KEY = 'caudals.connect.visitor';
const FIELDS = ['name', 'company', 'role', 'email', 'phone', 'web', 'message'] as const;

export function initCardPage() {
  const data = readJson<CardData>('card-data');
  if (!data) return;

  initQr();
  initShare(data);
  initExchange(data);
  void initStage(data);
}

function initQr() {
  const dialog = $<HTMLDialogElement>('[data-qr-sheet]');
  const triggers = $$('[data-open-qr]');
  if (!dialog || !triggers.length) return;
  let lock: WakeLockSentinel | null = null;
  const qr = sheet(dialog, {
    async onOpen() {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
      } catch {
        lock = null;
      }
    },
    onClose() {
      void lock?.release().catch(() => undefined);
      lock = null;
      if (location.hash === '#qr') history.replaceState(null, '', location.pathname + location.search);
    },
  });
  const select = (view: 'link' | 'offline') => {
    $$('[data-qr-tab]', dialog).forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.qrTab === view)));
    $$('[data-qr-view]', dialog).forEach((el) => (el.hidden = el.dataset.qrView !== view));
    $$('[data-qr-hint]', dialog).forEach((el) => (el.hidden = el.dataset.qrHint !== view));
  };
  $$('[data-qr-tab]', dialog).forEach((tab) =>
    tab.addEventListener('click', () => select(tab.dataset.qrTab === 'offline' ? 'offline' : 'link')),
  );
  for (const trigger of triggers) {
    trigger.hidden = false;
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      select('link');
      qr.open();
    });
  }
  const fromHash = () => {
    if (location.hash === '#qr') {
      select('link');
      qr.open();
    }
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();
}

function initShare(data: CardData) {
  const button = $('[data-share]');
  if (!button) return;
  const canShare = typeof navigator.share === 'function';
  if (!canShare && !navigator.clipboard) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    if (canShare) {
      try {
        await navigator.share({ title: data.name, text: data.t.shareText, url: data.cardUrl });
        return;
      } catch (error) {
        if ((error as DOMException)?.name === 'AbortError') return;
      }
    }
    toast((await copyText(data.cardUrl)) ? data.t.copied : data.t.shareFailed);
  });
}

function initExchange(data: CardData) {
  const dialog = $<HTMLDialogElement>('[data-exchange-sheet]');
  const trigger = $<HTMLAnchorElement>('[data-open-exchange]');
  const form = dialog?.querySelector('form');
  if (!dialog || !trigger || !form) return;
  const errorBox = $('[data-form-error]', form)!;
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;

  const restore = () => {
    const saved = store.get<Partial<Visitor>>(VISITOR_KEY);
    if (!saved) return;
    for (const field of FIELDS) {
      const el = input(field);
      if (el && field !== 'message' && !el.value) el.value = saved[field] ?? '';
    }
  };
  const read = (): Visitor => {
    const v = {} as Record<(typeof FIELDS)[number], string>;
    for (const field of FIELDS) v[field] = input(field)?.value ?? '';
    return v;
  };
  const showErrors = (errors: string[]) => {
    errorBox.hidden = errors.length === 0;
    errorBox.textContent = errors.join(' ');
  };

  const exchange = sheet(dialog, {
    onOpen() {
      restore();
      showErrors([]);
      const first = input('name');
      if (first && !first.value && window.matchMedia('(pointer: fine)').matches) first.focus();
    },
  });

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    exchange.open();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const via = (e.submitter as HTMLButtonElement | null)?.value === 'email' ? 'email' : 'whatsapp';
    const visitor = read();
    const errors = validateVisitor(visitor);
    if (errors.length) {
      showErrors(errors.map((err) => (err === 'name' ? data.t.errName : data.t.errContact)));
      input(errors[0] === 'name' ? 'name' : visitor.email ? 'email' : 'phone')?.focus();
      return;
    }
    showErrors([]);
    const { message: _note, ...remember } = visitor;
    store.set(VISITOR_KEY, remember);
    const composed = composeMessage(
      data.locale,
      { id: data.id, givenName: data.givenName, email: data.email, phone: data.phone },
      visitor,
      new Date(),
      data.host,
    );
    if (via === 'whatsapp') {
      const a = document.createElement('a');
      a.href = composed.whatsappUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } else {
      window.location.href = composed.mailtoUrl;
    }
    exchange.close();
  });

  for (const field of FIELDS) input(field)?.addEventListener('input', () => errorBox.hidden || showErrors([]));

  $('[data-forget]', form)?.addEventListener('click', () => {
    store.remove(VISITOR_KEY);
    form.reset();
    toast(data.t.forgotten);
  });
}

function webgl2(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

async function initStage(data: CardData) {
  const stage = $('[data-stage]');
  const canvas = $<HTMLCanvasElement>('.stage-canvas', stage ?? document);
  const flat = $('.card-flat', stage ?? document);
  const hint = $('[data-hint]');
  const motionButton = $<HTMLButtonElement>('[data-motion]');
  if (!stage || !canvas || !flat || !webgl2()) return;

  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scene: StageScene | null = null;
  let interacted = false;
  const onInteract = () => {
    if (interacted) return;
    interacted = true;
    hint?.classList.add('is-done');
  };

  try {
    const { createStage } = await import('./scene/stage.ts');
    scene = await createStage({
      canvas,
      stage,
      anchor: () => flat.getBoundingClientRect(),
      face: {
        cardLines: data.cardLines,
        roleLine: data.roleLine,
        phoneDisplay: data.phoneDisplay,
        email: data.email,
        shortUrl: `${data.host}/${data.id}`,
        qr: data.qr,
      },
      dark: dark.matches,
      reducedMotion: reduceMotion(),
      onReady: () => {
        stage.classList.add('is-live');
        hint?.classList.add('is-ready');
      },
      onInteract,
      onFlip: (back) => stage.classList.toggle('is-back', back),
      onTiltActive: () => {
        if (motionButton) motionButton.hidden = true;
      },
    });
  } catch (error) {
    console.warn('connect: 3D card unavailable', error);
    stage.classList.remove('is-live');
    return;
  }

  dark.addEventListener('change', (e) => scene?.setDark(e.matches));
  reduced.addEventListener('change', (e) => scene?.setReducedMotion(e.matches));

  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (motionButton && touch && scene.tiltNeedsPermission) {
    // iOS grants motion access only from a tap, so the first tap on the card
    // asks as well as the button; a refusal is not asked again from the card.
    // Tilt only moves reflections, so it stays available with Reduce Motion.
    let asked = false;
    const ask = async () => {
      if (asked || scene?.tiltActive()) return;
      asked = true;
      if (await scene?.enableTilt()) motionButton.hidden = true;
    };
    stage.addEventListener('click', () => void ask());
    motionButton.addEventListener('click', () => {
      onInteract();
      asked = false;
      void ask();
    });
    // Offer the button only where the phone has not started reporting tilt.
    window.setTimeout(() => {
      if (!scene?.tiltActive()) motionButton.hidden = false;
    }, 900);
  }
}

