"use client";

import { useRef, useState, type ComponentType } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MobileMenuSheetProps } from "@/components/ui/mobile-menu-sheet";

type SheetModule = typeof import("@/components/ui/mobile-menu-sheet");
let sheetModule: Promise<SheetModule> | null = null;
/** Loads the sheet once; the first pointer or focus on the button starts it early. */
const loadSheet = () => (sheetModule ??= import("@/components/ui/mobile-menu-sheet"));

type MobileMenuProps = Omit<MobileMenuSheetProps, "open" | "onOpenChange" | "onClosed"> & {
  /** The button's classes, as the header lays it out. */
  className: string;
  label: string;
};

/**
 * The header's menu button on small screens. The sheet behind it (a Radix
 * dialog with a scroll area) loads on first use instead of with the page
 * (launch L-24b); a visitor who opens it gets the same menu as before.
 */
export function MobileMenu({ className, label, ...sheet }: MobileMenuProps) {
  const [Sheet, setSheet] = useState<ComponentType<MobileMenuSheetProps> | null>(null);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const prefetch = () => void loadSheet().catch(() => {});

  const show = () => {
    loadSheet().then(
      (module) => {
        setSheet(() => module.MobileMenuSheet);
        setOpen(true);
      },
      () => {
        // The chunk failed to load (offline, new deployment): forget it so the next tap retries.
        sheetModule = null;
      },
    );
  };

  return (
    <>
      <Button
        ref={button}
        variant="ghost"
        size="icon"
        className={className}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={prefetch}
        onPointerDown={prefetch}
        onFocus={prefetch}
        onClick={show}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">{label}</span>
      </Button>
      {Sheet ? <Sheet {...sheet} open={open} onOpenChange={setOpen} onClosed={() => button.current?.focus()} /> : null}
    </>
  );
}
