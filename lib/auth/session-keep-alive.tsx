"use client";

import { useEffect } from "react";

import { betterAuthBasePath } from "@/lib/auth/better-auth-shared";

const STORAGE_KEY = "caudals.session-renewed-at";
const INTERVAL_MS = 5 * 60_000;

/**
 * Keeps a signed-in session rolling without asking for it on every page.
 *
 * better-auth renews the session cookie (8 h, renewed after 15 min of use)
 * only when the browser reads `GET /api/auth/get-session`. The app used to
 * mount better-auth's `useSession` on every page for that, although nothing
 * read the result: one request per load and per window focus. better-auth's
 * per-visitor limit (100 per 10 s) only resets after 10 quiet seconds, so a
 * person or an office on one address that kept clicking hit 429s (QA
 * 2026-10-15: 36 of 934 loads). One read per five minutes per browser keeps
 * the renewal (it is due every 15 minutes) and leaves the limit alone.
 * Server pages and the API check the session themselves.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    const renew = () => {
      if (document.visibilityState !== "visible") return;
      let last = 0;
      try {
        last = Number(window.localStorage.getItem(STORAGE_KEY)) || 0;
      } catch {
        /* storage blocked: renew on this visit */
      }
      const now = Date.now();
      if (now - last < INTERVAL_MS) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        /* best-effort */
      }
      // Read the body: an undrained response stays open in the browser's network layer.
      void fetch(`${betterAuthBasePath}/get-session`, { credentials: "same-origin", cache: "no-store" })
        .then((response) => response.text())
        .catch(() => undefined);
    };
    renew();
    const timer = window.setInterval(renew, INTERVAL_MS);
    document.addEventListener("visibilitychange", renew);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", renew);
    };
  }, []);
  return null;
}
