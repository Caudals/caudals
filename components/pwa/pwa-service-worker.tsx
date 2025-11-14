"use client";

import { useEffect } from "react";

export function PwaServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let mounted = true;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/pwa",
        });

        if (!mounted) {
          return;
        }

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      } catch (error) {
        console.error("[PWA] Failed to register service worker", error);
      }
    };

    register();

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
