"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

type CommandPaletteButtonProps = {
  compact?: boolean;
  className?: string;
};

export function CommandPaletteButton({
  compact = false,
  className,
}: CommandPaletteButtonProps) {
  const t = useTranslations();
  const shortcut = useMemo(() => {
    if (typeof window === "undefined") {
      return "Ctrl+K";
    }
    const isMac = window.navigator.platform.toUpperCase().includes("MAC");
    return isMac ? "⌘K" : "Ctrl+K";
  }, []);

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent("caudals:open-command-palette"));
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        compact
          ? "h-9 w-9 p-0"
          : "hidden h-9 gap-2 px-3 md:flex",
        className
      )}
      onClick={handleClick}
      aria-label={t("Open command palette")}
    >
      <Search className="h-4 w-4 text-muted-foreground" />
      {!compact && (
        <>
          <span className="text-muted-foreground text-sm">
            {t("Search or jump to...")}
          </span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
            <span className="text-xs">{shortcut}</span>
          </kbd>
        </>
      )}
    </Button>
  );
}
