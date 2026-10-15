"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { t } from "@/lib/evals/messages/runtime";
import { LocaleSwitch } from "./locale";

/**
 * The frame every unauthenticated evaluation screen sits in: sign-in, TOTP,
 * password reset, invitation acceptance.
 *
 * A single centred column on the chrome backdrop. No marketing copy, no split
 * hero — the person is here to get in, and everything else is a detour.
 */
export function AuthFrame({
  title,
  description,
  footer,
  children,
}: {
  title: string;
  description: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="p-root">
      <main className="p-auth">
        <div className="p-auth-inner">
          <p className="p-brand">
            <Image
              className="p-brand-wordmark"
              // The lockup at 108 px tall (3.6× its 30 px display), 7 KB instead of the 43 KB master (L-24c).
              src="/caudals-logo-wordmark-108.png"
              alt={t("brand")}
              width={321}
              height={108}
              priority
            />
          </p>
          <div className="p-auth-head">
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <section className="p-auth-card">{children}</section>
          {footer && <div className="p-auth-note">{footer}</div>}
          <div className="p-auth-note" style={{ display: "flex", justifyContent: "center" }}>
            <LocaleSwitch />
          </div>
        </div>
      </main>
    </div>
  );
}
