"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInternalTranslations } from "@/lib/i18n/internal";
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
  const t = useInternalTranslations();
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
          ? "h-9 w-9 p-0 bg-transparent border-transparent hover:bg-gray-100"
          : "hidden h-9 gap-2 px-3 md:flex w-full justify-between bg-gray-50 hover:bg-gray-100 border border-gray-200/60 shadow-none text-slate-500 transition-colors",
        className
      )}
      onClick={handleClick}
      aria-label={t("Open command palette")}
    >
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4" />
        {!compact && (
          <span className="text-sm font-normal">
            {t("Search or jump to...")}
          </span>
        )}
      </div>
      {!compact && (
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded bg-white border border-gray-200 px-1.5 font-mono text-[10px] font-medium text-gray-500 opacity-100 sm:flex shadow-sm">
          <span className="text-xs">{shortcut}</span>
        </kbd>
      )}
    </Button>
  );
}
