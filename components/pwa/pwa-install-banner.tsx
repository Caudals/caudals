"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt: () => Promise<void>;
}

const DISMISS_KEY = "caudals-pwa-install-dismissed";

const isStandalone = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const nav = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    nav.standalone === true
  );
};

const isMobileDevice = () =>
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const isIosDevice = () =>
  typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  const [bannerState, setBannerState] = useState(() => {
    if (!isMobileDevice() || isStandalone()) {
      return { visible: false, showIosInstruction: false };
    }

    const dismissed =
      typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY);

    if (dismissed) {
      return { visible: false, showIosInstruction: false };
    }

    if (isIosDevice()) {
      return { visible: true, showIosInstruction: true };
    }

    return { visible: false, showIosInstruction: false };
  });
  const { visible, showIosInstruction } = bannerState;

  useEffect(() => {
    if (!isMobileDevice() || isStandalone()) {
      return;
    }

    const dismissed =
      typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY);

    if (dismissed) {
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setBannerState((prev) => ({ ...prev, visible: true }));
    };

    window.addEventListener("beforeinstallprompt", handler as EventListener);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler as EventListener);
    };
  }, []);

  if (!visible) {
    return null;
  }

  const dismissBanner = () => {
    window.localStorage.setItem(DISMISS_KEY, "true");
    setBannerState({ visible: false, showIosInstruction: false });
    setDeferredPrompt(null);
  };

  const triggerInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;

    if (result.outcome === "accepted") {
      setBannerState((prev) => ({ ...prev, visible: false }));
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[70] px-4 md:hidden">
      <div className="pointer-events-auto rounded-3xl border border-slate-200/60 bg-white/95 p-4 text-slate-900 shadow-[0_15px_40px_rgba(15,23,42,0.25)] backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <Download className="h-4 w-4" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-sm font-semibold">Install Caudals Companion</p>
            {showIosInstruction && !deferredPrompt ? (
              <p className="text-xs text-slate-600">
                Tap the share icon in Safari and choose <strong>Add to Home Screen</strong>
                {" "}for quick uploads.
              </p>
            ) : (
              <p className="text-xs text-slate-600">
                Add the PWA to your home screen to browse briefs and upload files lightning
                fast.
              </p>
            )}
            <div className="mt-2 flex gap-2">
              {deferredPrompt ? (
                <Button size="sm" className="rounded-2xl px-4" onClick={triggerInstall}>
                  Install now
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-2xl border border-slate-200 px-4"
                  onClick={dismissBanner}
                >
                  Got it
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className={cn(
                  "rounded-2xl border border-transparent px-2 text-slate-500 hover:bg-slate-100"
                )}
                onClick={dismissBanner}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
