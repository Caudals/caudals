// Small DOM helpers shared by the pages: sheets, toast, clipboard and storage.

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);
export const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(selector));

export function readJson<T>(id: string): T | null {
  const el = document.getElementById(id);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as T;
  } catch {
    return null;
  }
}

export const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer = 0;
export function toast(message: string) {
  const el = $('[data-toast]');
  if (!el) return;
  el.textContent = message;
  el.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-on'), 2200);
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or blocked storage: nothing to remember.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Same as above.
    }
  },
};

/** Modal sheet on a native <dialog>, with an exit animation. */
export function sheet(dialog: HTMLDialogElement, hooks: { onOpen?: () => void; onClose?: () => void } = {}) {
  let closing = false;
  const finish = () => {
    closing = false;
    dialog.classList.remove('is-closing');
    if (dialog.open) dialog.close();
  };
  const close = () => {
    if (!dialog.open || closing) return;
    if (reduceMotion()) return finish();
    closing = true;
    dialog.classList.add('is-closing');
    window.setTimeout(finish, 240);
  };
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('has-sheet');
    hooks.onClose?.();
  });
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  $$('[data-close]', dialog).forEach((b) => b.addEventListener('click', close));
  return {
    open() {
      if (dialog.open) return;
      document.documentElement.classList.add('has-sheet');
      dialog.showModal();
      hooks.onOpen?.();
    },
    close,
    get isOpen() {
      return dialog.open;
    },
  };
}
