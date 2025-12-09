"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/i18n/use-translations";
import { useState } from "react";

export function CommandPaletteButton() {
  const t = useTranslations();
  const [mounted] = useState(() => typeof window !== "undefined");

  const handleClick = () => {
    // TODO: Open command palette
    console.log("Open command palette (⌘K)");
  };

  const isMac = mounted && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const shortcut = isMac ? "⌘K" : "Ctrl+K";

  return (
    <Button
      variant="outline"
      size="sm"
      className="hidden md:flex gap-2 h-9 px-3"
      onClick={handleClick}
    >
      <Search className="h-4 w-4 text-muted-foreground" />
      <span className="text-muted-foreground text-sm">
        {t("Search or jump to...")}
      </span>
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100 sm:flex">
        <span className="text-xs">{shortcut}</span>
      </kbd>
    </Button>
  );
}
