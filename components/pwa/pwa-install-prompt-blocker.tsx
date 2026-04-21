"use client";

import { useEffect } from "react";

export function PwaInstallPromptBlocker() {
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  return null;
}
