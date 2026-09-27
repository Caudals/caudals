"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { t, type MessageKey } from "@/lib/evals/messages/en";
import { LocaleSwitch } from "./locale";

/**
 * Frame for pages opened without an account (a shared report, an invitation):
 * the brand, one line of context, the content and a quiet footer. No
 * navigation — the recipient is here for one document.
 */
export function PublicFrame({ contextKey, children }: { contextKey: MessageKey; children: ReactNode }) {
  return (
    <div className="p-root p-public">
      <header className="p-public-bar">
        <span className="p-brand">
          <Image className="p-brand-mark" src="/caudals_logo_black.svg" alt="" width={32} height={32} priority />
          <span className="p-brand-name">Caudals</span>
        </span>
        <span className="p-public-context">{t(contextKey)}</span>
        <LocaleSwitch compact />
      </header>
      <main id="p-main" className="p-public-page">
        {children}
      </main>
      <footer className="p-public-foot">{t("publicFooter")}</footer>
    </div>
  );
}
