"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale, locales, defaultLocale } from "./config";

const LOCALE_STORAGE_KEY = "caudals_locale";
const GEOLOCATION_STORAGE_KEY = "caudals_country";
const GEOLOCATION_CACHE_TIME = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get user's country from browser geolocation or cached value
 * Uses client-side IP geolocation as fallback
 */
async function detectClientCountry(): Promise<string | null> {
  // Check cache first
  if (typeof localStorage !== "undefined") {
    try {
      const cached = localStorage.getItem(GEOLOCATION_STORAGE_KEY);
      if (cached) {
        const { country, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        if (age < GEOLOCATION_CACHE_TIME) {
          console.log(`[i18n client] Using cached country: ${country}`);
          return country;
        }
      }
    } catch (e) {
      console.debug("Error reading geolocation cache:", e);
    }
  }

  // Detect country from client-side
  try {
    // Use a free IP geolocation service (ipapi.co)
    const response = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      const country = data.country_code || data.countryCode;
      
      if (country && typeof localStorage !== "undefined") {
        try {
          localStorage.setItem(
            GEOLOCATION_STORAGE_KEY,
            JSON.stringify({ country, timestamp: Date.now() })
          );
          console.log(`[i18n client] Detected and cached country: ${country}`);
          return country;
        } catch (e) {
          console.debug("Could not cache geolocation:", e);
        }
      }
      
      return country || null;
    }
  } catch (error) {
    console.debug("Client-side geolocation failed:", error);
  }

  return null;
}

/**
 * Detects the user's preferred locale from multiple sources
 * Priority: Cookie > Country-based > LocalStorage > Navigator languages > Default
 */
async function detectClientLocale(): Promise<Locale> {
  // 1. Try cookie first (server already set this)
  if (typeof document !== "undefined") {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === LOCALE_COOKIE && locales.includes(value as Locale)) {
        console.log(`[i18n client] Using cookie locale: ${value}`);
        return value as Locale;
      }
    }
  }

  // 2. Try country-based detection (most reliable for Spanish users)
  const country = await detectClientCountry();
  if (country === "ES") {
    console.log("[i18n client] Detected Spain, using Spanish");
    return "es";
  }

  // 3. Try localStorage (works even with cookie blockers)
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored && locales.includes(stored as Locale)) {
        console.log(`[i18n client] Using localStorage locale: ${stored}`);
        return stored as Locale;
      }
    } catch (e) {
      console.debug("LocalStorage not available:", e);
    }
  }

  // 4. Try browser languages (check all languages, not just the first)
  if (typeof navigator !== "undefined") {
    // Check all languages in order of preference
    const languages = navigator.languages || [navigator.language];
    
    for (const browserLang of languages) {
      if (!browserLang) continue;
      
      const lower = browserLang.toLowerCase();
      
      // Check exact match
      if (locales.includes(lower as Locale)) {
        console.log(`[i18n client] Using browser language (exact): ${lower}`);
        return lower as Locale;
      }
      
      // Check language code only (e.g., 'es' from 'es-ES')
      const langCode = lower.split("-")[0];
      if (locales.includes(langCode as Locale)) {
        console.log(`[i18n client] Using browser language (code): ${langCode}`);
        return langCode as Locale;
      }
    }
    
    // Special handling for Spanish variants
    if (languages.some(lang => lang?.toLowerCase().startsWith("es"))) {
      console.log("[i18n client] Detected Spanish variant");
      return "es";
    }
  }

  // 5. Default fallback
  console.log("[i18n client] Using default locale");
  return defaultLocale;
}

/**
 * Saves the locale to both cookie and localStorage for redundancy
 */
function saveClientLocale(locale: Locale) {
  console.log(`[i18n client] Saving locale: ${locale}`);
  
  // Save to cookie with proper flags for Safari/mobile compatibility
  if (typeof document !== "undefined") {
    try {
      const expires = new Date();
      expires.setTime(expires.getTime() + LOCALE_COOKIE_MAX_AGE * 1000);
      
      // Use more compatible cookie format for Safari and mobile browsers
      const cookieParts = [
        `${LOCALE_COOKIE}=${locale}`,
        "path=/",
        `expires=${expires.toUTCString()}`,
        "SameSite=Lax",
      ];
      
      // Only add Secure in production HTTPS
      if (window.location.protocol === "https:") {
        cookieParts.push("Secure");
      }
      
      document.cookie = cookieParts.join("; ");
      console.log(`[i18n client] Cookie saved: ${locale}`);
    } catch (e) {
      console.error("Could not set cookie:", e);
    }
  }

  // Save to localStorage as backup
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      console.log(`[i18n client] LocalStorage saved: ${locale}`);
    } catch (e) {
      console.error("Could not set localStorage:", e);
    }
  }
}

/**
 * Hook to ensure locale is properly detected and persisted on the client
 * This runs once when the app loads to handle cases where server detection failed
 */
export function useClientLocaleDetection(serverLocale: Locale) {
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAndSetLocale() {
      try {
        console.log(`[i18n client] Server locale: ${serverLocale}`);
        const detectedLocale = await detectClientLocale();
        
        if (!mounted) return;

        // If detected locale differs from server locale, update it
        if (detectedLocale !== serverLocale) {
          console.log(`[i18n client] Mismatch detected. Server: ${serverLocale}, Client: ${detectedLocale}`);
          saveClientLocale(detectedLocale);
          
          // Reload the page to apply the new locale
          // Only if we're confident about the detection (not default)
          if (detectedLocale !== defaultLocale) {
            console.log("[i18n client] Reloading to apply new locale");
            window.location.reload();
            return;
          }
        } else {
          // Ensure the locale is persisted even if it matches
          console.log("[i18n client] Locale matches, persisting");
          saveClientLocale(serverLocale);
        }
      } catch (error) {
        console.error("[i18n client] Error detecting locale:", error);
        // On error, just save the server locale
        saveClientLocale(serverLocale);
      } finally {
        if (mounted) {
          setIsChecking(false);
        }
      }
    }

    checkAndSetLocale();

    return () => {
      mounted = false;
    };
  }, [serverLocale]);

  return isChecking;
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

