"use client";

import { useEffect } from "react";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale, locales, defaultLocale } from "./config";

const LOCALE_STORAGE_KEY = "caudals_locale";

/**
 * Detects the user's preferred locale from multiple sources
 * Priority: Cookie > LocalStorage > Navigator > Default
 */
function detectClientLocale(): Locale {
  // 1. Try cookie first
  if (typeof document !== "undefined") {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === LOCALE_COOKIE && locales.includes(value as Locale)) {
        return value as Locale;
      }
    }
  }

  // 2. Try localStorage (works even with cookie blockers)
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && locales.includes(stored as Locale)) {
        return stored as Locale;
      }
    } catch (e) {
      // LocalStorage might be blocked
      console.debug("LocalStorage not available:", e);
    }
  }

  // 3. Try browser language
  if (typeof navigator !== "undefined") {
    const browserLang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage;
    if (browserLang) {
      // Check exact match
      const exactMatch = browserLang.toLowerCase();
      if (locales.includes(exactMatch as Locale)) {
        return exactMatch as Locale;
      }
      
      // Check language code only (e.g., 'es' from 'es-ES')
      const langCode = exactMatch.split("-")[0];
      if (locales.includes(langCode as Locale)) {
        return langCode as Locale;
      }

      // Special case for Spanish-speaking regions
      if (browserLang.toLowerCase().startsWith("es")) {
        return "es";
      }
    }
  }

  // 4. Default fallback
  return defaultLocale;
}

/**
 * Saves the locale to both cookie and localStorage for redundancy
 */
function saveClientLocale(locale: Locale) {
  // Save to cookie
  if (typeof document !== "undefined") {
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + LOCALE_COOKIE_MAX_AGE * 1000);
      document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
    } catch (e) {
      console.debug("Could not set cookie:", e);
    }
  }

  // Save to localStorage as backup
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (e) {
      console.debug("Could not set localStorage:", e);
    }
  }
}

/**
 * Hook to ensure locale is properly detected and persisted on the client
 * This runs once when the app loads to handle cases where server detection failed
 */
export function useClientLocaleDetection(serverLocale: Locale) {
  useEffect(() => {
    const detectedLocale = detectClientLocale();
    
    // If detected locale differs from server locale, update it
    if (detectedLocale !== serverLocale) {
      saveClientLocale(detectedLocale);
      
      // Reload the page to apply the new locale
      // Only if we're confident about the detection
      if (detectedLocale !== defaultLocale) {
        window.location.reload();
      }
    } else {
      // Ensure the locale is persisted even if it matches
      saveClientLocale(serverLocale);
    }
  }, [serverLocale]);
}

/**
 * Component that handles client-side locale detection
 * Place this in your root layout to ensure proper locale detection
 */
export function ClientLocaleDetector({ serverLocale }: { serverLocale: Locale }) {
  useClientLocaleDetection(serverLocale);
  return null;
}

/**
 * Function to manually change the locale
 */
export function setLocale(locale: Locale) {
  if (!locales.includes(locale)) {
    console.error(`Invalid locale: ${locale}`);
    return;
  }
  
  saveClientLocale(locale);
  window.location.reload();
}

