"use client";

/**
 * Interactive platform overlays: dialogs, side panels, action menus, a
 * show-once secret field and toasts. Built directly on Radix so the platform
 * classes are the only styling layer. Visual contract: packages/brand/platform.css.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Toaster as SonnerToaster, toast } from "sonner";
import { Check, Copy, MoreHorizontal, X } from "lucide-react";
import { t } from "@/lib/evals/messages/en";

/* ----------------------------------------------------------------- modal -- */

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  alert,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** An outcome message for the action this dialog performs (it would otherwise sit behind the scrim). */
  alert?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="p-scrim" />
        <DialogPrimitive.Content className="p-root p-modal" data-size={size}>
          <div className="p-modal-head">
            <DialogPrimitive.Title className="p-modal-title">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="p-modal-desc">{description}</DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
            <DialogPrimitive.Close className="p-btn p-modal-close" data-variant="ghost" data-shape="icon" aria-label={t("close")}>
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {(children || alert) && (
            <div className="p-modal-body">
              {alert}
              {children}
            </div>
          )}
          {footer && <div className="p-modal-foot">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------ side panel -- */

/**
 * Detail inspector that slides in from the right. Modal on every width so
 * focus is trapped and restored; full-screen under 640px.
 */
export function SidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide = false,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** Where focus goes on close when the panel was not opened by a trigger it knows about. */
  returnFocus?: () => HTMLElement | null;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="p-scrim" data-kind="panel" />
        <DialogPrimitive.Content
          className="p-root p-panel"
          data-wide={wide ? "true" : undefined}
          onCloseAutoFocus={(event) => {
            const target = returnFocus?.();
            if (!target) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <div className="p-panel-head">
            <div className="p-panel-titles">
              <DialogPrimitive.Title className="p-panel-title">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="p-panel-desc">{description}</DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{typeof title === "string" ? title : t("details")}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="p-btn" data-variant="ghost" data-shape="icon" aria-label={t("close")}>
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="p-panel-body">{children}</div>
          {footer && <div className="p-panel-foot">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ------------------------------------------------------------------ menu -- */

export type MenuEntry =
  | { label: string; icon?: ReactNode; onSelect: () => void; tone?: "danger"; disabled?: boolean }
  | { label: string; icon?: ReactNode; href: string; external?: boolean; disabled?: boolean }
  | { separator: true }
  | { heading: string };

/** A small menu of row or page actions behind one trigger. */
export function ActionMenu({
  label,
  items,
  trigger,
  align = "end",
}: {
  label: string;
  items: MenuEntry[];
  trigger?: ReactNode;
  align?: "start" | "end";
}) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger asChild>
        {trigger ?? (
          <button type="button" className="p-btn" data-variant="ghost" data-shape="icon" aria-label={label}>
            <MoreHorizontal aria-hidden="true" />
          </button>
        )}
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Content className="p-root p-menu" align={align} sideOffset={6} collisionPadding={8}>
          {items.map((item, index) => {
            if ("separator" in item) return <MenuPrimitive.Separator key={`sep-${index}`} className="p-menu-sep" />;
            if ("heading" in item) return <MenuPrimitive.Label key={`h-${index}`} className="p-menu-label">{item.heading}</MenuPrimitive.Label>;
            if ("href" in item)
              return (
                <MenuPrimitive.Item key={item.label} asChild className="p-menu-item" disabled={item.disabled}>
                  {item.external ? (
                    <a href={item.href}>
                      {item.icon}
                      {item.label}
                    </a>
                  ) : (
                    <Link href={item.href}>
                      {item.icon}
                      {item.label}
                    </Link>
                  )}
                </MenuPrimitive.Item>
              );
            return (
              <MenuPrimitive.Item
                key={item.label}
                className="p-menu-item"
                data-tone={item.tone}
                disabled={item.disabled}
                onSelect={() => item.onSelect()}
              >
                {item.icon}
                {item.label}
              </MenuPrimitive.Item>
            );
          })}
        </MenuPrimitive.Content>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

/* ------------------------------------------------------------ copy field -- */

/**
 * A value shown exactly once (a token, a signing secret, an invitation link).
 * Copy is one click; the surrounding copy explains it will not appear again.
 */
export function CopyField({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard can be blocked; the value is still selectable. */
    }
  }
  return (
    <div className="p-copy">
      <span className="p-copy-label">{label}</span>
      <div className="p-copy-row">
        <input className="p-copy-value" readOnly value={value} aria-label={label} onFocus={(event) => event.target.select()} />
        <button type="button" className="p-btn" data-variant="secondary" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      {hint && <span className="p-field-hint">{hint}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- toasts -- */

/** Transient confirmation of a completed action. Errors stay inline instead. */
export function notify(message: string) {
  toast(message, { toasterId: "platform" });
}

export function Toaster() {
  return (
    <SonnerToaster
      id="platform"
      position="bottom-right"
      gap={8}
      toastOptions={{ unstyled: true, classNames: { toast: "p-toast", title: "p-toast-title" } }}
    />
  );
}
